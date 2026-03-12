/* compiler.c — Interpréteur direct .ben → exécution immédiate.
 *
 * "Le .ben EST le code. Pas de couche entre."
 *
 * Benoît écrit un .ben, pulse le lit, l'exécute. Point.
 * Pas de compilation, pas de bytecode intermédiaire.
 *
 * Syntaxe supportée:
 *   name: expr                    → assigne une variable
 *   name: _syscall(args)          → appel système (fichier, réseau, string)
 *   name: _func(args)             → appel de fonction définie
 *   _func arg1, arg2 ->           → définition de fonction
 *     cond? -> value              → branche conditionnelle
 *     else? -> value              → fallback
 *   -- commentaire                → ignoré
 *   name is value                 → test (ignoré)
 */

#include <string.h>
#include <openssl/ssl.h>
#include <openssl/err.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdarg.h>
#include <ctype.h>
#include <math.h>
#ifndef _WIN32
#include <sys/time.h>
#endif

/* ═══════ LIMITS ═══════ */
#define BEN_MAX_LINES    2048
#define BEN_MAX_VARS     512
#define BEN_MAX_FUNCS    128
#define BEN_MAX_ARGS     8
#define BEN_MAX_BODY     128
#define BEN_MAX_STR      512
#define BEN_MAX_STRTAB   256

/* ── Persistent memory store (survives between .ben cycles) ── */
#define BEN_MEM_MAX 64
typedef struct { char key[64]; double num; char str[512]; int is_str; } BenMemEntry;
static BenMemEntry ben_mem[BEN_MEM_MAX];
static int ben_mem_count = 0;

/* ═══════ VALUE TYPE ═══════ */
typedef enum { VAL_NUM, VAL_STR } ValType;
typedef struct {
    ValType type;
    double  num;
    char    str[BEN_MAX_STR];
} BenVal;

static BenVal ben_num(double n) { BenVal v; v.type = VAL_NUM; v.num = n; v.str[0] = 0; return v; }
static BenVal ben_str(const char *s) { BenVal v; v.type = VAL_STR; v.num = 0; strncpy(v.str, s, BEN_MAX_STR-1); v.str[BEN_MAX_STR-1] = 0; return v; }

/* ═══════ VARIABLE STORE ═══════ */
typedef struct {
    char   name[64];
    BenVal val;
} BenVar;

typedef struct {
    BenVar vars[BEN_MAX_VARS];
    int    count;
} BenEnv;

static BenVal *ben_env_get(BenEnv *env, const char *name) {
    for (int i = 0; i < env->count; i++) {
        if (strcmp(env->vars[i].name, name) == 0) return &env->vars[i].val;
    }
    return NULL;
}

static void ben_env_set(BenEnv *env, const char *name, BenVal val) {
    for (int i = 0; i < env->count; i++) {
        if (strcmp(env->vars[i].name, name) == 0) { env->vars[i].val = val; return; }
    }
    if (env->count < BEN_MAX_VARS) {
        strncpy(env->vars[env->count].name, name, 63);
        env->vars[env->count].name[63] = 0;
        env->vars[env->count].val = val;
        env->count++;
    }
}

/* ═══════ FUNCTION TABLE ═══════ */
typedef struct {
    char name[64];
    char args[BEN_MAX_ARGS][64];
    int  nargs;
    const char *body_lines[BEN_MAX_BODY];
    int  nbody;
} BenFunc;

typedef struct {
    BenFunc funcs[BEN_MAX_FUNCS];
    int count;
} BenFuncs;

/* ═══════ INTERPRETER CONTEXT ═══════ */
typedef struct {
    BenEnv   *env;       /* variables */
    BenFuncs *funcs;     /* function definitions */
    VM       *vm;        /* access to neural arrays */
    char     *arena_path;/* for file resolution */
    int       depth;     /* recursion depth */
    /* Output log */
    char     log[BEN_MAX_STR * 4];
    int      log_len;
} BenInterp;

/* Forward declarations */
static BenVal ben_eval_expr(BenInterp *interp, const char *expr);
static BenVal ben_eval_cond_chain(BenInterp *interp, const char **lines, int nlines);
static BenVal ben_call_func(BenInterp *interp, const char *name, BenVal *args, int nargs);

/* ═══════ HELPERS ═══════ */
static void ben_log(BenInterp *interp, const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(interp->log + interp->log_len,
                      sizeof(interp->log) - interp->log_len, fmt, ap);
    va_end(ap);
    if (n > 0) interp->log_len += n;
}

static int ben_indent(const char *line) {
    int n = 0;
    for (int i = 0; line[i]; i++) {
        if (line[i] == ' ') n++;
        else if (line[i] == '\t') n += 2;
        else break;
    }
    return n;
}

static const char *ben_trim(const char *s) {
    while (*s == ' ' || *s == '\t' || *s == '\r') s++;
    return s;
}

/* Skip whitespace in expression parsing */
static int skip_ws(const char *s, int i) {
    while (s[i] == ' ' || s[i] == '\t') i++;
    return i;
}

/* ═══════ EXPRESSION PARSER ═══════ */
/* Parse a single atom: number, string, variable, function call */
static BenVal parse_atom(BenInterp *interp, const char *expr, int *pos) {
    int i = skip_ws(expr, *pos);

    /* String literal */
    if (expr[i] == '"') {
        i++;
        char buf[BEN_MAX_STR];
        int k = 0;
        while (expr[i] && expr[i] != '"' && k < BEN_MAX_STR - 1) {
            if (expr[i] == '\\' && expr[i+1]) {
                char c = expr[i+1];
                if (c == 'n') { buf[k++] = '\n'; i += 2; }
                else if (c == 'r') { buf[k++] = '\r'; i += 2; }
                else if (c == 't') { buf[k++] = '\t'; i += 2; }
                else if (c == '\\') { buf[k++] = '\\'; i += 2; }
                else if (c == '"') { buf[k++] = '"'; i += 2; }
                else { buf[k++] = expr[i]; i++; }
            } else {
                buf[k++] = expr[i]; i++;
            }
        }
        buf[k] = 0;
        if (expr[i] == '"') i++;
        *pos = i;
        return ben_str(buf);
    }

    /* Number (including negative) */
    if (isdigit((unsigned char)expr[i]) || (expr[i] == '-' && isdigit((unsigned char)expr[i+1]))) {
        char buf[64];
        int k = 0;
        if (expr[i] == '-') buf[k++] = expr[i++];
        while ((isdigit((unsigned char)expr[i]) || expr[i] == '.') && k < 63) {
            buf[k++] = expr[i++];
        }
        buf[k] = 0;
        *pos = i;
        return ben_num(atof(buf));
    }

    /* Identifier or function call */
    if (isalpha((unsigned char)expr[i]) || expr[i] == '_') {
        char name[64];
        int k = 0;
        while ((isalnum((unsigned char)expr[i]) || expr[i] == '_') && k < 63) {
            name[k++] = expr[i++];
        }
        name[k] = 0;
        i = skip_ws(expr, i);

        /* Function call: name(args) */
        if (expr[i] == '(') {
            i++; /* skip ( */
            BenVal args[BEN_MAX_ARGS];
            int nargs = 0;

            i = skip_ws(expr, i);
            if (expr[i] != ')') {
                /* Parse arguments separated by commas */
                while (nargs < BEN_MAX_ARGS) {
                    /* Find the extent of this argument (handle nested parens and strings) */
                    int depth = 0;
                    int arg_start = i;
                    int in_str = 0;
                    char arg_buf[BEN_MAX_STR];
                    int ak = 0;
                    while (expr[i]) {
                        if (in_str && expr[i] == '\\' && expr[i+1] == '"') {
                            /* escaped quote inside string -- copy both chars, don't toggle in_str */
                            if (ak < BEN_MAX_STR - 2) { arg_buf[ak++] = expr[i]; arg_buf[ak++] = expr[i+1]; }
                            i += 2;
                            continue;
                        }
                        if (expr[i] == '"') { in_str = !in_str; }
                        else if (!in_str) {
                            if (expr[i] == '(') depth++;
                            else if (expr[i] == ')') {
                                if (depth == 0) break;
                                depth--;
                            } else if (expr[i] == ',' && depth == 0) break;
                        }
                        if (ak < BEN_MAX_STR - 1) arg_buf[ak++] = expr[i];
                        i++;
                    }
                    arg_buf[ak] = 0;
                    args[nargs++] = ben_eval_expr(interp, arg_buf);
                    if (expr[i] == ',') { i++; i = skip_ws(expr, i); }
                    else break;
                }
            }
            if (expr[i] == ')') i++;
            *pos = i;
            return ben_call_func(interp, name, args, nargs);
        }

        *pos = i;

        /* Variable lookup */
        BenVal *v = ben_env_get(interp->env, name);
        if (v) return *v;

        /* Check VM arrays: a_N, seuil_N, etc. */
        if (interp->vm) {
            if (strncmp(name, "a_", 2) == 0) {
                int idx = atoi(name + 2);
                if (idx >= 0 && idx < interp->vm->N)
                    return ben_num(interp->vm->arrays[ARR_A][idx]);
            }
            if (strncmp(name, "seuil_", 6) == 0) {
                int idx = atoi(name + 6);
                if (idx >= 0 && idx < interp->vm->N)
                    return ben_num(interp->vm->arrays[ARR_SEUIL][idx]);
            }
            if (strncmp(name, "lr_", 3) == 0) {
                int idx = atoi(name + 3);
                if (idx >= 0 && idx < interp->vm->N)
                    return ben_num(interp->vm->arrays[ARR_LR][idx]);
            }
        }

        return ben_num(0); /* unknown → 0 */
    }

    /* Array literal: [elem, elem, ...] → CSV VAL_STR */
    if (expr[i] == '[') {
        i++; /* skip [ */
        while (expr[i] == ' ') i++;
        char buf[BEN_MAX_STR]; int bk = 0; buf[0] = 0;
        while (expr[i] && expr[i] != ']') {
            /* extract one element (respecting nested [] and "") */
            int depth = 0; int in_str = 0;
            char elem[BEN_MAX_STR]; int ek = 0;
            while (expr[i]) {
                if (expr[i] == '"') in_str = !in_str;
                else if (!in_str) {
                    if (expr[i] == '[') depth++;
                    else if (expr[i] == ']') { if (depth == 0) break; depth--; }
                    else if (expr[i] == ',' && depth == 0) break;
                }
                if (ek < BEN_MAX_STR - 1) elem[ek++] = expr[i];
                i++;
            }
            elem[ek] = 0;
            /* trim whitespace from elem */
            char *ep = elem; while (*ep == ' ') ep++;
            int el = (int)strlen(ep); while (el > 0 && ep[el-1] == ' ') ep[--el] = 0;
            if (*ep) {
                BenVal ev = ben_eval_expr(interp, ep);
                if (bk > 0 && bk < BEN_MAX_STR - 2) buf[bk++] = ',';
                if (ev.type == VAL_STR)
                    bk += snprintf(buf + bk, BEN_MAX_STR - bk, "%s", ev.str);
                else
                    bk += snprintf(buf + bk, BEN_MAX_STR - bk, "%.6g", ev.num);
            }
            if (expr[i] == ',') i++;
            while (expr[i] == ' ') i++;
        }
        buf[bk] = 0;
        if (expr[i] == ']') i++;
        *pos = i;
        return ben_str(buf);
    }

    /* Parenthesized expression */
    if (expr[i] == '(') {
        i++;
        char sub[BEN_MAX_STR];
        int k = 0, depth = 0;
        while (expr[i]) {
            if (expr[i] == '(') depth++;
            else if (expr[i] == ')') {
                if (depth == 0) { i++; break; }
                depth--;
            }
            if (k < BEN_MAX_STR - 1) sub[k++] = expr[i];
            i++;
        }
        sub[k] = 0;
        *pos = i;
        return ben_eval_expr(interp, sub);
    }

    *pos = i + 1;
    return ben_num(0);
}

/* Parse a multiplicative term: handles *, /, % with left-to-right association.
 * Called by ben_eval_expr to give * and / higher precedence than + and -. */
static BenVal parse_term(BenInterp *interp, const char *expr, int *pos) {
    BenVal left = parse_atom(interp, expr, pos);

    while (expr[*pos]) {
        *pos = skip_ws(expr, *pos);
        char op = expr[*pos];
        if (op == '*') { (*pos)++; BenVal r = parse_atom(interp, expr, pos); left = ben_num(left.num * r.num); continue; }
        if (op == '/') { (*pos)++; BenVal r = parse_atom(interp, expr, pos); left = ben_num(r.num != 0 ? left.num / r.num : 0); continue; }
        if (op == '%') { (*pos)++; BenVal r = parse_atom(interp, expr, pos); left = ben_num(r.num != 0 ? fmod(left.num, r.num) : 0); continue; }
        break;
    }

    return left;
}

/* Evaluate a full expression with correct operator precedence:
 *   additive (+, -)  <  multiplicative (*, /, %)  <  atom
 * Comparison and equality operators are also handled here (lowest precedence). */
static BenVal ben_eval_expr(BenInterp *interp, const char *expr) {
    if (!expr || !*expr) return ben_num(0);

    int pos = 0;
    BenVal left = parse_term(interp, expr, &pos);

    while (expr[pos]) {
        pos = skip_ws(expr, pos);
        if (!expr[pos]) break;

        char op = expr[pos];
        char op2 = expr[pos + 1];

        /* Two-char operators */
        if (op == '=' && op2 == '=') {
            pos += 2;
            BenVal right = parse_term(interp, expr, &pos);
            if (left.type == VAL_STR && right.type == VAL_STR)
                left = ben_num(strcmp(left.str, right.str) == 0 ? 1 : 0);
            else
                left = ben_num(left.num == right.num ? 1 : 0);
            continue;
        }
        if (op == '!' && op2 == '=') {
            pos += 2;
            BenVal right = parse_term(interp, expr, &pos);
            if (left.type == VAL_STR && right.type == VAL_STR)
                left = ben_num(strcmp(left.str, right.str) != 0 ? 1 : 0);
            else
                left = ben_num(left.num != right.num ? 1 : 0);
            continue;
        }
        if (op == '>' && op2 == '=') {
            pos += 2;
            BenVal right = parse_term(interp, expr, &pos);
            left = ben_num(left.num >= right.num ? 1 : 0);
            continue;
        }
        if (op == '<' && op2 == '=') {
            pos += 2;
            BenVal right = parse_term(interp, expr, &pos);
            left = ben_num(left.num <= right.num ? 1 : 0);
            continue;
        }
        if (op == '-' && op2 == '>') break; /* arrow, stop */

        /* Single-char additive operators */
        if (op == '+') {
            pos++;
            BenVal right = parse_term(interp, expr, &pos);
            if (left.type == VAL_STR || right.type == VAL_STR) {
                /* String concatenation */
                char buf[BEN_MAX_STR];
                if (left.type == VAL_STR && right.type == VAL_STR)
                    snprintf(buf, BEN_MAX_STR, "%s%s", left.str, right.str);
                else if (left.type == VAL_STR)
                    snprintf(buf, BEN_MAX_STR, "%s%.6g", left.str, right.num);
                else
                    snprintf(buf, BEN_MAX_STR, "%.6g%s", left.num, right.str);
                left = ben_str(buf);
            } else {
                left = ben_num(left.num + right.num);
            }
            continue;
        }
        if (op == '-') { pos++; BenVal r = parse_term(interp, expr, &pos); left = ben_num(left.num - r.num); continue; }
        if (op == '>') { pos++; BenVal r = parse_term(interp, expr, &pos); left = ben_num(left.num > r.num ? 1 : 0); continue; }
        if (op == '<') { pos++; BenVal r = parse_term(interp, expr, &pos); left = ben_num(left.num < r.num ? 1 : 0); continue; }

        break; /* unknown, stop */
    }

    return left;
}

/* ═══════ SYSCALL DISPATCH ═══════ */
static BenVal ben_call_func(BenInterp *interp, const char *name, BenVal *args, int nargs) {
    if (interp->depth > 20) return ben_num(0); /* prevent infinite recursion */
    interp->depth++;

    BenVal result = ben_num(0);

    /* ── File I/O ── */
    if (strcmp(name, "_write_file") == 0 && nargs >= 2) {
        char path[512];
        if (interp->arena_path && args[0].str[0] && args[0].str[0] != '/' && args[0].str[1] != ':')
            snprintf(path, 512, "%s/%s", interp->arena_path, args[0].str);
        else
            strncpy(path, args[0].str, 511);
        FILE *f = fopen(path, "w");
        if (f) {
            const char *content = (args[1].type == VAL_STR) ? args[1].str : "";
            fputs(content, f);
            fclose(f);
            result = ben_num(1);
            ben_log(interp, "[ben] wrote %s (%d bytes)\n", path, (int)strlen(content));
        }
    }
    else if (strcmp(name, "_read_file") == 0 && nargs >= 1) {
        char path[512];
        if (interp->arena_path && args[0].str[0] && args[0].str[0] != '/' && args[0].str[1] != ':')
            snprintf(path, 512, "%s/%s", interp->arena_path, args[0].str);
        else
            strncpy(path, args[0].str, 511);
        FILE *f = fopen(path, "rb");
        if (f) {
            fseek(f, 0, SEEK_END);
            long sz = ftell(f);
            if (sz > BEN_MAX_STR - 1) sz = BEN_MAX_STR - 1;
            fseek(f, 0, SEEK_SET);
            char *buf = malloc(sz + 1);
            fread(buf, 1, sz, f);
            buf[sz] = 0;
            fclose(f);
            result = ben_str(buf);
            free(buf);
        }
    }
    else if (strcmp(name, "_append_file") == 0 && nargs >= 2) {
        char path[512];
        if (interp->arena_path && args[0].str[0] && args[0].str[0] != '/' && args[0].str[1] != ':')
            snprintf(path, 512, "%s/%s", interp->arena_path, args[0].str);
        else
            strncpy(path, args[0].str, 511);
        FILE *f = fopen(path, "a");
        if (f) {
            fputs(args[1].type == VAL_STR ? args[1].str : "", f);
            fclose(f);
            result = ben_num(1);
        }
    }
    else if (strcmp(name, "_file_exists") == 0 && nargs >= 1) {
        char path[512];
        if (interp->arena_path && args[0].str[0] && args[0].str[0] != '/' && args[0].str[1] != ':')
            snprintf(path, 512, "%s/%s", interp->arena_path, args[0].str);
        else
            strncpy(path, args[0].str, 511);
        FILE *f = fopen(path, "r");
        if (f) { fclose(f); result = ben_num(1); }
    }
    else if (strcmp(name, "_delete_file") == 0 && nargs >= 1) {
        char path[512];
        if (interp->arena_path && args[0].str[0] && args[0].str[0] != '/' && args[0].str[1] != ':')
            snprintf(path, 512, "%s/%s", interp->arena_path, args[0].str);
        else
            strncpy(path, args[0].str, 511);
        result = ben_num(remove(path) == 0 ? 1 : 0);
    }
    else if (strcmp(name, "_copy_file") == 0 && nargs >= 2) {
        /* _copy_file(src, dst) — binary copy, no size limit */
        char src[512], dst[512];
        if (interp->arena_path && args[0].str[0] && args[0].str[0] != '/' && args[0].str[1] != ':')
            snprintf(src, 512, "%s/%s", interp->arena_path, args[0].str);
        else strncpy(src, args[0].str, 511);
        if (interp->arena_path && args[1].str[0] && args[1].str[0] != '/' && args[1].str[1] != ':')
            snprintf(dst, 512, "%s/%s", interp->arena_path, args[1].str);
        else strncpy(dst, args[1].str, 511);
        FILE *fin = fopen(src, "rb");
        if (fin) {
            FILE *fout = fopen(dst, "wb");
            if (fout) {
                char buf[4096];
                size_t n;
                while ((n = fread(buf, 1, sizeof(buf), fin)) > 0)
                    fwrite(buf, 1, n, fout);
                fclose(fout);
                result = ben_num(1);
                ben_log(interp, "[ben] copied %s -> %s", src, dst);
            }
            fclose(fin);
        }
    }
    else if (strcmp(name, "_rename_file") == 0 && nargs >= 2) {
        /* _rename_file(old, new) — atomic rename */
        char oldp[512], newp[512];
        if (interp->arena_path && args[0].str[0] && args[0].str[0] != '/' && args[0].str[1] != ':')
            snprintf(oldp, 512, "%s/%s", interp->arena_path, args[0].str);
        else strncpy(oldp, args[0].str, 511);
        if (interp->arena_path && args[1].str[0] && args[1].str[0] != '/' && args[1].str[1] != ':')
            snprintf(newp, 512, "%s/%s", interp->arena_path, args[1].str);
        else strncpy(newp, args[1].str, 511);
        result = ben_num(rename(oldp, newp) == 0 ? 1 : 0);
        if (result.num == 1) ben_log(interp, "[ben] renamed %s -> %s", oldp, newp);
    }
    else if (strcmp(name, "_list_dir") == 0 && nargs >= 1) {
        char path[512];
        if (interp->arena_path && args[0].str[0] && args[0].str[0] != '/' && args[0].str[1] != ':')
            snprintf(path, 512, "%s/%s", interp->arena_path, args[0].str);
        else
            strncpy(path, args[0].str, 511);
        #ifdef _WIN32
        char pattern[520];
        snprintf(pattern, 520, "%s\\*", path);
        WIN32_FIND_DATAA fd;
        HANDLE h = FindFirstFileA(pattern, &fd);
        if (h != INVALID_HANDLE_VALUE) {
            char buf[BEN_MAX_STR];
            int k = 0;
            do {
                if (fd.cFileName[0] == '.') continue;
                int n = snprintf(buf + k, BEN_MAX_STR - k, "%s\n", fd.cFileName);
                if (n > 0) k += n;
            } while (FindNextFileA(h, &fd) && k < BEN_MAX_STR - 100);
            FindClose(h);
            buf[k] = 0;
            result = ben_str(buf);
        }
        #else
        DIR *d = opendir(path);
        if (d) {
            char buf[BEN_MAX_STR];
            int k = 0;
            struct dirent *ent;
            while ((ent = readdir(d)) != NULL && k < BEN_MAX_STR - 100) {
                if (ent->d_name[0] == '.') continue;
                int n = snprintf(buf + k, BEN_MAX_STR - k, "%s\n", ent->d_name);
                if (n > 0) k += n;
            }
            closedir(d);
            buf[k] = 0;
            result = ben_str(buf);
        }
        #endif
    }
    else if (strcmp(name, "_print") == 0 && nargs >= 1) {
        if (args[0].type == VAL_STR) {
            printf("%s", args[0].str);
            ben_log(interp, "[ben:print] %s", args[0].str);
        } else {
            printf("%.6g", args[0].num);
        }
        result = ben_num(1);
    }
    /* ── String operations ── */
    else if (strcmp(name, "_str_cat") == 0 && nargs >= 2) {
        char buf[BEN_MAX_STR];
        snprintf(buf, BEN_MAX_STR, "%s%s",
                 args[0].type == VAL_STR ? args[0].str : "",
                 args[1].type == VAL_STR ? args[1].str : "");
        result = ben_str(buf);
    }
    else if (strcmp(name, "_str_len") == 0 && nargs >= 1) {
        result = ben_num(args[0].type == VAL_STR ? (double)strlen(args[0].str) : 0);
    }
    else if (strcmp(name, "_num_to_str") == 0 && nargs >= 1) {
        char buf[64];
        double v = args[0].num;
        if (v == (int)v) snprintf(buf, 64, "%d", (int)v);
        else snprintf(buf, 64, "%.6g", v);
        result = ben_str(buf);
    }
    else if (strcmp(name, "_str_to_num") == 0 && nargs >= 1) {
        result = ben_num(args[0].type == VAL_STR ? atof(args[0].str) : args[0].num);
    }
    else if (strcmp(name, "_str_trim") == 0 && nargs >= 1) {
        /* _str_trim(s) — strip leading/trailing whitespace and newlines */
        if (args[0].type == VAL_STR) {
            char buf[BEN_MAX_STR];
            strncpy(buf, args[0].str, BEN_MAX_STR - 1);
            buf[BEN_MAX_STR - 1] = 0;
            /* rtrim */
            int len = (int)strlen(buf);
            while (len > 0 && (buf[len-1] == '\n' || buf[len-1] == '\r' || buf[len-1] == ' ' || buf[len-1] == '\t'))
                buf[--len] = 0;
            /* ltrim */
            char *start = buf;
            while (*start == ' ' || *start == '\t' || *start == '\n' || *start == '\r') start++;
            result = ben_str(start);
        }
    }
    else if (strcmp(name, "_str_find") == 0 && nargs >= 2) {
        if (args[0].type == VAL_STR && args[1].type == VAL_STR) {
            char *p = strstr(args[0].str, args[1].str);
            result = ben_num(p ? (double)(p - args[0].str) : -1);
        } else result = ben_num(-1);
    }
    else if (strcmp(name, "_str_eq") == 0 && nargs >= 2) {
        result = ben_num(args[0].type == VAL_STR && args[1].type == VAL_STR &&
                         strcmp(args[0].str, args[1].str) == 0 ? 1 : 0);
    }
    else if (strcmp(name, "_str_slice") == 0 && nargs >= 3) {
        if (args[0].type == VAL_STR) {
            int start = (int)args[1].num;
            int end = (int)args[2].num;
            int len = (int)strlen(args[0].str);
            if (start < 0) start = 0;
            if (end > len) end = len;
            if (start < end) {
                char buf[BEN_MAX_STR];
                int n = end - start;
                if (n > BEN_MAX_STR - 1) n = BEN_MAX_STR - 1;
                strncpy(buf, args[0].str + start, n);
                buf[n] = 0;
                result = ben_str(buf);
            }
        }
    }
    /* ── Network ── */
    else if (strcmp(name, "_net_connect") == 0 && nargs >= 2) {
        #ifdef _WIN32
        net_init();
        #endif
        const char *host = args[0].type == VAL_STR ? args[0].str : "127.0.0.1";
        int port = (int)args[1].num;
        struct addrinfo hints, *res;
        memset(&hints, 0, sizeof(hints));
        hints.ai_family = AF_INET;
        hints.ai_socktype = SOCK_STREAM;
        char port_str[16];
        snprintf(port_str, 16, "%d", port);
        if (getaddrinfo(host, port_str, &hints, &res) == 0) {
            SOCKET s = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
            if (s != INVALID_SOCKET) {
                if (connect(s, res->ai_addr, (int)res->ai_addrlen) == 0) {
                    int sid = sock_register(s);
                    result = ben_num(sid);
                    ben_log(interp, "[ben:net] connected to %s:%d (sock=%d)\n", host, port, sid);
                } else {
                    closesocket(s);
                    result = ben_num(-1);
                }
            }
            freeaddrinfo(res);
        } else result = ben_num(-1);
    }
    else if (strcmp(name, "_net_send") == 0 && nargs >= 2) {
        int sid = (int)args[0].num;
        const char *data = args[1].type == VAL_STR ? args[1].str : "";
        if (sid >= 0 && sid < MAX_SOCKETS && sock_table[sid] != INVALID_SOCKET) {
            int sent = send(sock_table[sid], data, (int)strlen(data), 0);
            result = ben_num(sent);
        } else result = ben_num(-1);
    }
    else if (strcmp(name, "_net_recv") == 0 && nargs >= 2) {
        int sid = (int)args[0].num;
        int maxlen = (int)args[1].num;
        if (maxlen <= 0) maxlen = 4096;
        if (maxlen > BEN_MAX_STR - 1) maxlen = BEN_MAX_STR - 1;
        result = ben_str(""); /* always return string, even on failure */
        if (sid >= 0 && sid < MAX_SOCKETS && sock_table[sid] != INVALID_SOCKET) {
            /* Set 8-second receive timeout */
            #ifdef _WIN32
            { DWORD tv = 8000; setsockopt(sock_table[sid], SOL_SOCKET, SO_RCVTIMEO, (const char*)&tv, sizeof(tv)); }
            #else
            { struct timeval tv; tv.tv_sec = 8; tv.tv_usec = 0; setsockopt(sock_table[sid], SOL_SOCKET, SO_RCVTIMEO, (void*)&tv, sizeof(tv)); }
            #endif
            char *buf = malloc(maxlen + 1);
            int total = 0;
            int n;
            while (total < maxlen) {
                n = recv(sock_table[sid], buf + total, maxlen - total, 0);
                if (n <= 0) break;
                total += n;
            }
            buf[total] = 0;
            result = ben_str(buf);
            free(buf);
        }
    }
    else if (strcmp(name, "_net_close") == 0 && nargs >= 1) {
        int sid = (int)args[0].num;
        if (sid >= 0 && sid < MAX_SOCKETS && sock_table[sid] != INVALID_SOCKET) {
            closesocket(sock_table[sid]);
            sock_table[sid] = INVALID_SOCKET;
            result = ben_num(1);
        }
    }

    else if (strcmp(name, "_net_http_get") == 0 && nargs >= 1) {
        /* _net_http_get(url) -- HTTP GET simple, retourne le body (max 4096 chars)
         * Signature .ben: resp = _net_http_get("http://host/path")
         * Utilise POSIX sockets purs, pas de libcurl. */
        if (args[0].type == VAL_STR) {
            const char *url = args[0].str;
            char host[256];
            int  port = 80;
            char path[512];
            memset(host, 0, sizeof(host));
            strncpy(path, "/", sizeof(path)-1);

            /* strip http:// prefix */
            const char *p = url;
            int is_valid = 1;
            if (strncmp(p, "http://", 7) == 0) {
                p += 7;
            } else {
                result = ben_str("ERROR: unsupported scheme");
                is_valid = 0;
            }

            if (is_valid) {
                /* split host[:port][/path] */
                const char *slash = strchr(p, '/');
                const char *colon_pos = (slash) ? NULL : strchr(p, ':');
                /* check colon before slash */
                const char *tmp_colon = strchr(p, ':');
                if (tmp_colon && (!slash || tmp_colon < slash)) {
                    colon_pos = tmp_colon;
                }
                size_t host_len;
                if (colon_pos) {
                    host_len = (size_t)(colon_pos - p);
                    port = atoi(colon_pos + 1);
                } else {
                    host_len = slash ? (size_t)(slash - p) : strlen(p);
                }
                if (host_len >= sizeof(host)) host_len = sizeof(host) - 1;
                memcpy(host, p, host_len);
                if (slash) {
                    strncpy(path, slash, sizeof(path) - 1);
                    path[sizeof(path)-1] = 0;
                }

                /* resolve + connect */
                net_init();
                struct addrinfo hints, *res_ai = NULL;
                memset(&hints, 0, sizeof(hints));
                hints.ai_family   = AF_INET;
                hints.ai_socktype = SOCK_STREAM;
                char port_str[16];
                snprintf(port_str, sizeof(port_str), "%d", port);
                int ok = 1;
                if (getaddrinfo(host, port_str, &hints, &res_ai) != 0 || !res_ai) {
                    result = ben_str("ERROR: dns");
                    ok = 0;
                }
                if (ok) {
                    SOCKET hs = socket(res_ai->ai_family, res_ai->ai_socktype, res_ai->ai_protocol);
                    if (hs == INVALID_SOCKET) {
                        freeaddrinfo(res_ai);
                        result = ben_str("ERROR: socket");
                        ok = 0;
                    }
                    if (ok && connect(hs, res_ai->ai_addr, (int)res_ai->ai_addrlen) != 0) {
                        closesocket(hs);
                        freeaddrinfo(res_ai);
                        result = ben_str("ERROR: connect");
                        ok = 0;
                    }
                    if (ok) {
                        freeaddrinfo(res_ai);
                        /* 3-second receive timeout */
#ifdef _WIN32
                        { DWORD tv_ms = 3000; setsockopt(hs, SOL_SOCKET, SO_RCVTIMEO, (const char*)&tv_ms, sizeof(tv_ms)); }
#else
                        { struct timeval tv; tv.tv_sec = 3; tv.tv_usec = 0;
                          setsockopt(hs, SOL_SOCKET, SO_RCVTIMEO, (void*)&tv, sizeof(tv)); }
#endif
                        /* send HTTP GET request */
                        char req[768];
                        int rlen = snprintf(req, sizeof(req),
                            "GET %s HTTP/1.0\r\nHost: %s\r\nConnection: close\r\n\r\n",
                            path, host);
                        send(hs, req, rlen, 0);

                        /* read full response */
                        char *http_buf = (char*)malloc(65537);
                        if (http_buf) {
                            int total = 0, rcv;
                            while (total < 65536) {
                                rcv = recv(hs, http_buf + total, 65536 - total, 0);
                                if (rcv <= 0) break;
                                total += rcv;
                            }
                            http_buf[total] = 0;
                            closesocket(hs);

                            /* skip HTTP headers: find 

 */
                            char *body_start = strstr(http_buf, "\r\n\r\n");
                            if (!body_start) body_start = http_buf;
                            else             body_start += 4;

                            /* truncate body to 4096 chars */
                            if ((int)strlen(body_start) > 4096) body_start[4096] = 0;
                            result = ben_str(body_start);
                            ben_log(interp, "[ben:http_get] %s -> %d bytes\n",
                                    url, (int)strlen(body_start));
                            free(http_buf);
                        } else {
                            closesocket(hs);
                            result = ben_str("ERROR: oom");
                        }
                    }
                }
            }
        }
    }

    else if (strcmp(name, "_net_http_post") == 0 && nargs >= 2) {
        /* _net_http_post(url, body) -- HTTP POST JSON, retourne le body (max 4096 chars)
         * Signature .ben: resp = _net_http_post("http://host/path", json_body) */
        if (args[0].type == VAL_STR && args[1].type == VAL_STR) {
            const char *url  = args[0].str;
            const char *body = args[1].str;
            char host[256];
            int  port = 80;
            char path[512];
            memset(host, 0, sizeof(host));
            strncpy(path, "/", sizeof(path)-1);

            const char *p = url;
            int is_valid = 1;
            if (strncmp(p, "http://", 7) == 0) {
                p += 7;
            } else {
                result = ben_str("ERROR: unsupported scheme");
                is_valid = 0;
            }
            if (is_valid) {
                const char *slash = strchr(p, '/');
                const char *tmp_colon = strchr(p, ':');
                const char *colon_pos = NULL;
                if (tmp_colon && (!slash || tmp_colon < slash)) colon_pos = tmp_colon;
                size_t host_len;
                if (colon_pos) {
                    host_len = (size_t)(colon_pos - p);
                    port = atoi(colon_pos + 1);
                } else {
                    host_len = slash ? (size_t)(slash - p) : strlen(p);
                }
                if (host_len >= sizeof(host)) host_len = sizeof(host) - 1;
                memcpy(host, p, host_len);
                if (slash) { strncpy(path, slash, sizeof(path)-1); path[sizeof(path)-1] = 0; }

                net_init();
                struct addrinfo hints, *res_ai = NULL;
                memset(&hints, 0, sizeof(hints));
                hints.ai_family   = AF_INET;
                hints.ai_socktype = SOCK_STREAM;
                char port_str[16];
                snprintf(port_str, sizeof(port_str), "%d", port);
                int ok = 1;
                if (getaddrinfo(host, port_str, &hints, &res_ai) != 0 || !res_ai) {
                    result = ben_str("ERROR: dns");
                    ok = 0;
                }
                if (ok) {
                    SOCKET hs = socket(res_ai->ai_family, res_ai->ai_socktype, res_ai->ai_protocol);
                    if (hs == INVALID_SOCKET) { freeaddrinfo(res_ai); result = ben_str("ERROR: socket"); ok = 0; }
                    if (ok && connect(hs, res_ai->ai_addr, (int)res_ai->ai_addrlen) != 0) {
                        closesocket(hs); freeaddrinfo(res_ai); result = ben_str("ERROR: connect"); ok = 0;
                    }
                    if (ok) {
                        freeaddrinfo(res_ai);
                        /* 10-second receive timeout (Ollama peut etre lent) */
#ifdef _WIN32
                        { DWORD tv_ms = 10000; setsockopt(hs, SOL_SOCKET, SO_RCVTIMEO, (const char*)&tv_ms, sizeof(tv_ms)); }
#else
                        { struct timeval tv; tv.tv_sec = 10; tv.tv_usec = 0;
                          setsockopt(hs, SOL_SOCKET, SO_RCVTIMEO, (void*)&tv, sizeof(tv)); }
#endif
                        size_t body_len = strlen(body);
                        char req[1024];
                        int rlen = snprintf(req, sizeof(req),
                            "POST %s HTTP/1.0\r\nHost: %s\r\nContent-Type: application/json\r\nContent-Length: %zu\r\nConnection: close\r\n\r\n",
                            path, host, body_len);
                        send(hs, req, rlen, 0);
                        send(hs, body, (int)body_len, 0);

                        char *http_buf = (char*)malloc(65537);
                        if (http_buf) {
                            int total = 0, rcv;
                            while (total < 65536) {
                                rcv = recv(hs, http_buf + total, 65536 - total, 0);
                                if (rcv <= 0) break;
                                total += rcv;
                            }
                            http_buf[total] = 0;
                            closesocket(hs);
                            char *body_start = strstr(http_buf, "\r\n\r\n");
                            if (!body_start) body_start = http_buf;
                            else             body_start += 4;
                            if ((int)strlen(body_start) > 4096) body_start[4096] = 0;
                            result = ben_str(body_start);
                            ben_log(interp, "[ben:http_post] %s -> %d bytes\n", url, (int)strlen(body_start));
                            free(http_buf);
                        } else { closesocket(hs); result = ben_str("ERROR: oom"); }
                    }
                }
            }
        }
    }

    else if (strcmp(name, "_net_https_get") == 0 && nargs >= 1) {
        /* _net_https_get(url) -- HTTPS GET via OpenSSL, retourne le body (max 4096 chars)
         * Signature .ben: resp = _net_https_get("https://host/path") */
        if (args[0].type == VAL_STR) {
            const char *url = args[0].str;
            char host[256]; int port = 443; char path[512];
            memset(host, 0, sizeof(host));
            strncpy(path, "/", sizeof(path)-1);
            const char *p = url; int is_valid = 1;
            if (strncmp(p, "https://", 8) == 0) { p += 8; }
            else if (strncmp(p, "http://", 7) == 0) { p += 7; port = 80; }
            else { result = ben_str("ERROR: unsupported scheme"); is_valid = 0; }
            if (is_valid) {
                const char *slash = strchr(p, '/');
                const char *tmp_colon = strchr(p, ':'); const char *colon_pos = NULL;
                if (tmp_colon && (!slash || tmp_colon < slash)) colon_pos = tmp_colon;
                size_t host_len;
                if (colon_pos) { host_len = (size_t)(colon_pos - p); port = atoi(colon_pos + 1); }
                else { host_len = slash ? (size_t)(slash - p) : strlen(p); }
                if (host_len >= sizeof(host)) host_len = sizeof(host) - 1;
                memcpy(host, p, host_len);
                if (slash) { strncpy(path, slash, sizeof(path)-1); path[sizeof(path)-1] = 0; }

                net_init();
                struct addrinfo hints2, *res_ai2 = NULL;
                memset(&hints2, 0, sizeof(hints2));
                hints2.ai_family = AF_INET; hints2.ai_socktype = SOCK_STREAM;
                char port_str2[16]; snprintf(port_str2, sizeof(port_str2), "%d", port);
                int ok2 = 1;
                int gai2 = getaddrinfo(host, port_str2, &hints2, &res_ai2);
                if (gai2 != 0 || !res_ai2) {
                    char ebuf2[128];
                    snprintf(ebuf2, sizeof(ebuf2), "ERROR:dns(%s)", gai_strerror(gai2));
                    result = ben_str(ebuf2);
                    ben_log(interp, "[ben:https_get] DNS FAIL host=%s err=%s\n", host, gai_strerror(gai2));
                    ok2 = 0;
                }
                if (ok2) {
                    SOCKET hs2 = socket(res_ai2->ai_family, res_ai2->ai_socktype, res_ai2->ai_protocol);
                    if (hs2 == INVALID_SOCKET) { freeaddrinfo(res_ai2); result = ben_str("ERROR: socket"); ok2 = 0; }
                    if (ok2 && connect(hs2, res_ai2->ai_addr, (int)res_ai2->ai_addrlen) != 0) {
                        closesocket(hs2); freeaddrinfo(res_ai2); result = ben_str("ERROR: connect"); ok2 = 0;
                    }
                    if (ok2) {
                        freeaddrinfo(res_ai2);
                        /* SSL handshake */
                        SSL_CTX *ctx2 = SSL_CTX_new(TLS_client_method());
                        SSL_CTX_set_verify(ctx2, SSL_VERIFY_NONE, NULL);
                        SSL *ssl2 = SSL_new(ctx2);
                        SSL_set_fd(ssl2, (int)hs2);
                        SSL_set_tlsext_host_name(ssl2, host);
                        if (SSL_connect(ssl2) != 1) {
                            SSL_free(ssl2); SSL_CTX_free(ctx2); closesocket(hs2);
                            result = ben_str("ERROR: ssl_connect"); ok2 = 0;
                        }
                        if (ok2) {
                            char req2[768];
                            int rlen2 = snprintf(req2, sizeof(req2),
                                "GET %s HTTP/1.0\r\nHost: %s\r\nUser-Agent: Benoit/2.0\r\nConnection: close\r\n\r\n",
                                path, host);
                            SSL_write(ssl2, req2, rlen2);
                            char *http_buf2 = (char*)malloc(65537);
                            if (http_buf2) {
                                int total2 = 0, rcv2;
                                while (total2 < 65536) {
                                    rcv2 = SSL_read(ssl2, http_buf2 + total2, 65536 - total2);
                                    if (rcv2 <= 0) break;
                                    total2 += rcv2;
                                }
                                http_buf2[total2] = 0;
                                SSL_free(ssl2); SSL_CTX_free(ctx2); closesocket(hs2);
                                /* Check for redirect (301/302/303) */
                                int is_redir2 = (strncmp(http_buf2, "HTTP/", 5) == 0) &&
                                               (strstr(http_buf2, " 301 ") || strstr(http_buf2, " 302 ") ||
                                                strstr(http_buf2, " 303 ") || strstr(http_buf2, " 307 "));
                                if (is_redir2) {
                                    char *loc2 = strstr(http_buf2, "\r\nLocation: ");
                                    if (!loc2) loc2 = strstr(http_buf2, "\r\nlocation: ");
                                    if (loc2) {
                                        loc2 += 12;
                                        char *loc_end2 = strstr(loc2, "\r\n");
                                        if (!loc_end2) loc_end2 = loc2 + strlen(loc2);
                                        char redir_url2[512]; int rlen3 = (int)(loc_end2 - loc2);
                                        if (rlen3 >= 512) rlen3 = 511;
                                        strncpy(redir_url2, loc2, rlen3); redir_url2[rlen3] = 0;
                                        free(http_buf2);
                                        BenVal redir_arg2[1]; redir_arg2[0] = ben_str(redir_url2);
                                        result = ben_call_func(interp, "_net_https_get", redir_arg2, 1);
                                        ben_log(interp, "[ben:https_get] redirect -> %s\n", redir_url2);
                                    } else { free(http_buf2); result = ben_str("ERROR: redirect no location"); }
                                } else {
                                    char *body_start2 = strstr(http_buf2, "\r\n\r\n");
                                    if (!body_start2) body_start2 = http_buf2;
                                    else              body_start2 += 4;
                                    if ((int)strlen(body_start2) > 4096) body_start2[4096] = 0;
                                    result = ben_str(body_start2);
                                    ben_log(interp, "[ben:https_get] %s -> %d bytes\n", url, (int)strlen(body_start2));
                                    free(http_buf2);
                                }
                            } else { SSL_free(ssl2); SSL_CTX_free(ctx2); closesocket(hs2); result = ben_str("ERROR: oom"); }
                        }
                    }
                }
            }
        }
    }

    else if (strcmp(name, "_net_listen") == 0 && nargs >= 1) {
        int port = (int)args[0].num;
        #ifdef _WIN32
        net_init();
        #endif
        SOCKET s = socket(AF_INET, SOCK_STREAM, 0);
        if (s != INVALID_SOCKET) {
            int opt = 1;
            setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char *)&opt, sizeof(opt));
            struct sockaddr_in addr;
            memset(&addr, 0, sizeof(addr));
            addr.sin_family = AF_INET;
            addr.sin_addr.s_addr = INADDR_ANY;
            addr.sin_port = htons((unsigned short)port);
            if (bind(s, (struct sockaddr *)&addr, sizeof(addr)) == 0 &&
                listen(s, 5) == 0) {
                int sid = sock_register(s);
                result = ben_num(sid);
                ben_log(interp, "[ben:net] listening on port %d\n", port);
            } else { closesocket(s); result = ben_num(-1); }
        }
    }
    /* ── System ── */
    else if (strcmp(name, "_time") == 0) {
        result = ben_num((double)time(NULL));
    }
    else if (strcmp(name, "_time_ms") == 0) {
        #ifdef _WIN32
        result = ben_num((double)GetTickCount64());
        #else
        struct timespec ts;
        clock_gettime(CLOCK_REALTIME, &ts);
        result = ben_num(ts.tv_sec * 1000.0 + ts.tv_nsec / 1e6);
        #endif
    }
    else if (strcmp(name, "_sleep_ms") == 0 && nargs >= 1) {
        int ms = (int)args[0].num;
        if (ms > 0 && ms < 10000) {
            #ifdef _WIN32
            Sleep(ms);
            #else
            usleep(ms * 1000);
            #endif
        }
    }
    else if (strcmp(name, "_exec") == 0 && nargs >= 1) {
        if (args[0].type == VAL_STR) {
            result = ben_num(system(args[0].str));
            ben_log(interp, "[ben:exec] %s\n", args[0].str);
        }
    }
    else if (strcmp(name, "_random") == 0) {
        result = ben_num((double)rand() / RAND_MAX);
    }
    /* ── Neuro-modulation interne : récompense et punition ── */
    /* "Benoit se juge lui-même. Il n'attend plus qu'on lui dise si c'était bien." */
    else if (strcmp(name, "_reward") == 0 && nargs >= 1) {
        /* _reward(n) — renforce le neurone n : boost activation + poids sortants */
        int n = (int)args[0].num;
        VM *vm = interp->vm;
        if (vm && n >= 0 && n < vm->N) {
            Neuron *neu = &vm->neurons[n];
            /* Boost l'activation, plafonné au cap du neurone */
            neu->activation = fminf(neu->activation + 2.0f, neu->cap);
            /* Renforce tous les poids sortants de 10% (cap absolu: 2.0) */
            for (int s = 0; s < neu->n_syn; s++) {
                neu->synapses[s].weight = fminf(neu->synapses[s].weight * 1.1f, 2.0f);
            }
            ben_log(interp, "[ben:reward] neurone %d renforce (act=%.2f, %d synapses)\n",
                    n, neu->activation, neu->n_syn);
            result = ben_num(1.0);
        }
        /* n invalide : retourne 0.0 sans crasher */
    }
    else if (strcmp(name, "_punish") == 0 && nargs >= 1) {
        /* _punish(n) — inhibe le neurone n : réduit activation + poids sortants */
        int n = (int)args[0].num;
        VM *vm = interp->vm;
        if (vm && n >= 0 && n < vm->N) {
            Neuron *neu = &vm->neurons[n];
            /* Réduit l'activation, plancher à 0 */
            neu->activation = fmaxf(neu->activation - 2.0f, 0.0f);
            /* Affaiblit tous les poids sortants de 10% */
            for (int s = 0; s < neu->n_syn; s++) {
                neu->synapses[s].weight *= 0.9f;
            }
            ben_log(interp, "[ben:punish] neurone %d inhibe (act=%.2f, %d synapses)\n",
                    n, neu->activation, neu->n_syn);
            result = ben_num(0.0);
        }
        /* n invalide : retourne 0.0 sans crasher */
    }
    /* ── Math builtins ── */
    else if (strcmp(name, "_sqrt") == 0 && nargs >= 1) {
        result = ben_num(sqrt(args[0].num));
    }
    else if (strcmp(name, "_pow") == 0 && nargs >= 2) {
        result = ben_num(pow(args[0].num, args[1].num));
    }
    else if (strcmp(name, "_abs") == 0 && nargs >= 1) {
        result = ben_num(fabs(args[0].num));
    }
    else if (strcmp(name, "_floor") == 0 && nargs >= 1) {
        result = ben_num(floor(args[0].num));
    }
    else if (strcmp(name, "_mod") == 0 && nargs >= 2) {
        result = ben_num(args[1].num != 0 ? fmod(args[0].num, args[1].num) : 0);
    }
    else if (strcmp(name, "_round") == 0 && nargs >= 1) {
        result = ben_num(round(args[0].num));
    }
    else if (strcmp(name, "_sin") == 0 && nargs >= 1) {
        result = ben_num(sin(args[0].num));
    }
    else if (strcmp(name, "_cos") == 0 && nargs >= 1) {
        result = ben_num(cos(args[0].num));
    }
    else if (strcmp(name, "_tan") == 0 && nargs >= 1) {
        result = ben_num(tan(args[0].num));
    }
    else if (strcmp(name, "_asin") == 0 && nargs >= 1) {
        result = ben_num(asin(args[0].num));
    }
    else if (strcmp(name, "_acos") == 0 && nargs >= 1) {
        result = ben_num(acos(args[0].num));
    }
    else if (strcmp(name, "_atan") == 0 && nargs >= 1) {
        result = ben_num(atan(args[0].num));
    }
    else if (strcmp(name, "_atan2") == 0 && nargs >= 2) {
        result = ben_num(atan2(args[0].num, args[1].num));
    }
    else if (strcmp(name, "_max") == 0 && nargs >= 2) {
        result = ben_num(args[0].num > args[1].num ? args[0].num : args[1].num);
    }
    else if (strcmp(name, "_min") == 0 && nargs >= 2) {
        result = ben_num(args[0].num < args[1].num ? args[0].num : args[1].num);
    }
    else if (strcmp(name, "_ceil") == 0 && nargs >= 1) {
        result = ben_num(ceil(args[0].num));
    }
    else if (strcmp(name, "_log") == 0 && nargs >= 1) {
        result = ben_num(log(args[0].num));
    }
    else if (strcmp(name, "_exp") == 0 && nargs >= 1) {
        result = ben_num(exp(args[0].num));
    }
    else if (strcmp(name, "_sign") == 0 && nargs >= 1) {
        result = ben_num(args[0].num > 0 ? 1 : args[0].num < 0 ? -1 : 0);
    }
    else if (strcmp(name, "_mem_set") == 0 && nargs >= 2) {
        /* _mem_set("key", value) — store value in persistent memory */
        const char *key = args[0].str;
        for (int i = 0; i < ben_mem_count; i++) {
            if (strcmp(ben_mem[i].key, key) == 0) {
                if (args[1].type == VAL_STR) { strncpy(ben_mem[i].str, args[1].str, 511); ben_mem[i].is_str = 1; }
                else { ben_mem[i].num = args[1].num; ben_mem[i].is_str = 0; }
                result = ben_num(1);
                interp->depth--; return result;
            }
        }
        if (ben_mem_count < BEN_MEM_MAX) {
            strncpy(ben_mem[ben_mem_count].key, key, 63);
            if (args[1].type == VAL_STR) { strncpy(ben_mem[ben_mem_count].str, args[1].str, 511); ben_mem[ben_mem_count].is_str = 1; }
            else { ben_mem[ben_mem_count].num = args[1].num; ben_mem[ben_mem_count].is_str = 0; }
            ben_mem_count++;
            result = ben_num(1);
        }
    }
    else if (strcmp(name, "_mem_get") == 0 && nargs >= 1) {
        /* _mem_get("key") — retrieve value from persistent memory, 0 if not found */
        const char *key = args[0].str;
        for (int i = 0; i < ben_mem_count; i++) {
            if (strcmp(ben_mem[i].key, key) == 0) {
                result = ben_mem[i].is_str ? ben_str(ben_mem[i].str) : ben_num(ben_mem[i].num);
                interp->depth--; return result;
            }
        }
        result = ben_num(0); /* not found → 0 */
    }
    else if (strcmp(name, "_mem_has") == 0 && nargs >= 1) {
        /* _mem_has("key") — 1 if key exists, 0 otherwise */
        const char *key = args[0].str;
        result = ben_num(0);
        for (int i = 0; i < ben_mem_count; i++) {
            if (strcmp(ben_mem[i].key, key) == 0) { result = ben_num(1); break; }
        }
    }
    else if (strcmp(name, "_mem_del") == 0 && nargs >= 1) {
        /* _mem_del("key") — delete a key from persistent memory */
        const char *key = args[0].str;
        for (int i = 0; i < ben_mem_count; i++) {
            if (strcmp(ben_mem[i].key, key) == 0) {
                ben_mem[i] = ben_mem[--ben_mem_count]; /* swap with last */
                result = ben_num(1);
                break;
            }
        }
    }
    /* ── Array builtins (CSV encoding) ── */
    else if (strcmp(name, "_arr_cat") == 0 && nargs >= 2) {
        /* concat two CSV arrays: "1,2" + "3,4" -> "1,2,3,4" */
        char buf[BEN_MAX_STR];
        const char *a = args[0].type == VAL_STR ? args[0].str : "";
        const char *b = args[1].type == VAL_STR ? args[1].str : "";
        if (*a && *b) snprintf(buf, BEN_MAX_STR, "%s,%s", a, b);
        else if (*a) snprintf(buf, BEN_MAX_STR, "%s", a);
        else snprintf(buf, BEN_MAX_STR, "%s", b);
        result = ben_str(buf);
    }
    else if (strcmp(name, "_arr_len") == 0 && nargs >= 1) {
        if (args[0].type == VAL_STR && args[0].str[0]) {
            int count = 1;
            for (const char *p = args[0].str; *p; p++) if (*p == ',') count++;
            result = ben_num(count);
        } else result = ben_num(0);
    }
    else if (strcmp(name, "_arr_get") == 0 && nargs >= 2) {
        if (args[0].type == VAL_STR) {
            int idx = (int)args[1].num;
            const char *p = args[0].str;
            for (int ci = 0; ci < idx && p && *p; ci++) {
                p = strchr(p, ',');
                if (p) p++;
            }
            if (p && *p) {
                const char *end = strchr(p, ',');
                char elem[BEN_MAX_STR];
                int n = end ? (int)(end - p) : (int)strlen(p);
                if (n >= BEN_MAX_STR) n = BEN_MAX_STR - 1;
                strncpy(elem, p, n); elem[n] = 0;
                char *endptr;
                double d = strtod(elem, &endptr);
                result = (*endptr == 0) ? ben_num(d) : ben_str(elem);
            }
        }
    }
    else if (strcmp(name, "_arr_push") == 0 && nargs >= 2) {
        /* _arr_push(arr, val) — append val to CSV array */
        char buf[BEN_MAX_STR];
        const char *a = args[0].type == VAL_STR ? args[0].str : "";
        char val[64];
        if (args[1].type == VAL_STR)
            snprintf(val, 64, "%s", args[1].str);
        else
            snprintf(val, 64, "%.6g", args[1].num);
        if (*a) snprintf(buf, BEN_MAX_STR, "%s,%s", a, val);
        else snprintf(buf, BEN_MAX_STR, "%s", val);
        result = ben_str(buf);
    }
    else if (strcmp(name, "_arr_slice") == 0 && nargs >= 3) {
        /* _arr_slice(arr, start, len) — extract len elements from index start */
        if (args[0].type == VAL_STR) {
            int start = (int)args[1].num;
            int len   = (int)args[2].num;
            const char *p = args[0].str;
            /* advance to start index */
            for (int ci = 0; ci < start && p && *p; ci++) {
                p = strchr(p, ',');
                if (p) p++;
            }
            if (!p || !*p) { result = ben_str(""); }
            else {
                char buf[BEN_MAX_STR]; int bk = 0;
                for (int ci = 0; ci < len && p && *p; ci++) {
                    const char *end = strchr(p, ',');
                    int n = end ? (int)(end - p) : (int)strlen(p);
                    if (bk > 0 && bk < BEN_MAX_STR - 2) buf[bk++] = ',';
                    int copy = n < BEN_MAX_STR - bk - 1 ? n : BEN_MAX_STR - bk - 1;
                    strncpy(buf + bk, p, copy); bk += copy;
                    p = end ? end + 1 : NULL;
                }
                buf[bk] = 0;
                result = ben_str(buf);
            }
        }
    }
    /* ── User-defined function ── */
    else {
        /* Look up in function table */
        for (int i = 0; i < interp->funcs->count; i++) {
            BenFunc *fn = &interp->funcs->funcs[i];
            if (strcmp(fn->name, name) == 0) {
                /* Create local env with args (heap-allocated to avoid stack overflow) */
                BenEnv *local = malloc(sizeof(BenEnv));
                if (!local) { interp->depth--; return ben_num(0); }
                memcpy(local, interp->env, sizeof(BenEnv));
                for (int a = 0; a < fn->nargs && a < nargs; a++) {
                    ben_env_set(local, fn->args[a], args[a]);
                }
                BenEnv *old_env = interp->env;
                interp->env = local;
                result = ben_eval_cond_chain(interp, fn->body_lines, fn->nbody);
                interp->env = old_env;
                free(local);
                break;
            }
        }
    }

    interp->depth--;
    return result;
}

/* ═══════ CONDITIONAL CHAIN ═══════ */
static BenVal ben_eval_cond_chain(BenInterp *interp, const char **lines, int nlines) {
    BenVal result = ben_num(0);

    for (int i = 0; i < nlines; i++) {
        const char *line = lines[i];
        if (!line) continue;
        const char *trimmed = ben_trim(line);
        if (!*trimmed || (trimmed[0] == '-' && trimmed[1] == '-')) continue;

        /* else? -> value */
        if (strncmp(trimmed, "else?", 5) == 0) {
            const char *arrow = strstr(trimmed + 5, "->");
            if (arrow) {
                result = ben_eval_expr(interp, ben_trim(arrow + 2));
                return result;
            }
            continue;
        }

        /* cond? -> value */
        const char *q = strchr(trimmed, '?');
        if (q) {
            /* Extract condition (everything before ?) */
            char cond[BEN_MAX_STR];
            int n = (int)(q - trimmed);
            if (n > BEN_MAX_STR - 1) n = BEN_MAX_STR - 1;
            strncpy(cond, trimmed, n);
            cond[n] = 0;

            BenVal cv = ben_eval_expr(interp, cond);
            if (cv.num != 0) {
                /* Condition true */
                const char *arrow = strstr(q + 1, "->");
                if (arrow && *(ben_trim(arrow + 2))) {
                    /* Inline value */
                    result = ben_eval_expr(interp, ben_trim(arrow + 2));
                    return result;
                } else {
                    /* Sub-block */
                    int this_indent = ben_indent(line);
                    const char *sub[BEN_MAX_BODY];
                    int nsub = 0;
                    int j = i + 1;
                    while (j < nlines && nsub < BEN_MAX_BODY) {
                        if (!lines[j]) { j++; continue; }
                        const char *tl = ben_trim(lines[j]);
                        if (!*tl || (tl[0] == '-' && tl[1] == '-')) { j++; continue; }
                        if (ben_indent(lines[j]) <= this_indent) break;
                        sub[nsub++] = lines[j];
                        j++;
                    }
                    result = ben_eval_cond_chain(interp, sub, nsub);
                    return result;
                }
            }
            /* Condition false — skip sub-block if any */
            int this_indent = ben_indent(line);
            while (i + 1 < nlines && ben_indent(lines[i+1]) > this_indent) i++;
        }
    }

    return result;
}

/* ═══════ MAIN INTERPRETER ═══════ */
/* Execute a .ben source file. Returns execution log. */
static int ben_exec(VM *vm, const char *src, const char *arena_path, char *log_out, int log_max) {
    /* Split into lines */
    char *src_copy = strdup(src);
    if (!src_copy) return -1;

    char *lines[BEN_MAX_LINES];
    int nlines = 0;
    char *p = src_copy;
    while (*p && nlines < BEN_MAX_LINES) {
        lines[nlines] = p;
        char *nl = strchr(p, '\n');
        if (nl) { *nl = 0; p = nl + 1; }
        else p += strlen(p);
        /* Strip trailing \r (Windows line endings) */
        int len = (int)strlen(lines[nlines]);
        while (len > 0 && lines[nlines][len-1] == '\r') lines[nlines][--len] = 0;
        nlines++;
    }

    /* Initialize */
    BenEnv env;
    memset(&env, 0, sizeof(env));
    BenFuncs funcs;
    memset(&funcs, 0, sizeof(funcs));
    BenInterp interp;
    memset(&interp, 0, sizeof(interp));
    interp.env = &env;
    interp.funcs = &funcs;
    interp.vm = vm;
    interp.arena_path = arena_path ? strdup(arena_path) : NULL;

    /* Inject VM state as variables */
    if (vm) {
        ben_env_set(&env, "tick", ben_num(vm->vars[0]));         /* VAR_TICK */
        ben_env_set(&env, "N", ben_num((double)vm->N));
        ben_env_set(&env, "actifs", ben_num(vm->vars[4]));       /* VAR_ACTIFS */
        ben_env_set(&env, "conns", ben_num(vm->vars[6]));        /* VAR_CONNS */
        ben_env_set(&env, "score", ben_num(vm->vars[30]));       /* VAR_SCORE */
        ben_env_set(&env, "fails", ben_num(vm->vars[17]));       /* VAR_FAILS */
        ben_env_set(&env, "etat", ben_num(vm->vars[9]));         /* VAR_ETAT */
        ben_env_set(&env, "decision", ben_num(vm->vars[11]));    /* VAR_DECISION */
        ben_env_set(&env, "TMP", ben_num(0));
        ben_env_set(&env, "write_result", ben_num(0));
        /* Vision vars injected by vision_scan() */
        ben_env_set(&env, "vis_files",   ben_num(vm->vars[59]));  /* VAR_VIS_FILES */
        ben_env_set(&env, "vis_size_kb", ben_num(vm->vars[60]));  /* VAR_VIS_SIZE_KB */
        ben_env_set(&env, "vis_ben",     ben_num(vm->vars[61]));  /* VAR_VIS_BEN */
        ben_env_set(&env, "vis_changes", ben_num(vm->vars[62]));  /* VAR_VIS_CHANGES */
        ben_env_set(&env, "vis_pct_ben", ben_num(vm->vars[63]));  /* VAR_VIS_PCT_BEN */
    }

    /* First pass: collect function definitions */
    for (int i = 0; i < nlines; i++) {
        const char *trimmed = ben_trim(lines[i]);
        if (!*trimmed || (trimmed[0] == '-' && trimmed[1] == '-')) continue;

        /* Function: _name args -> */
        if (trimmed[0] == '_' || (isalpha((unsigned char)trimmed[0]))) {
            /* Check for arrow */
            const char *arrow = strstr(trimmed, "->");
            if (arrow && funcs.count < BEN_MAX_FUNCS) {
                /* Is it a function def? First token must be ident, followed by args, then -> */
                char first[64];
                int k = 0;
                const char *s = trimmed;
                while (*s && (isalnum((unsigned char)*s) || *s == '_') && k < 63) first[k++] = *s++;
                first[k] = 0;

                /* Skip if it's a binding (has : before ->) */
                const char *colon = strchr(trimmed, ':');
                if (colon && colon < arrow) continue;

                BenFunc *fn = &funcs.funcs[funcs.count];
                strncpy(fn->name, first, 63);
                fn->nargs = 0;

                /* Parse args between name and -> */
                s = ben_trim(s);
                while (s < arrow && fn->nargs < BEN_MAX_ARGS) {
                    while (s < arrow && (*s == ' ' || *s == ',' || *s == '\t')) s++;
                    if (s >= arrow) break;
                    char arg[64];
                    int ak = 0;
                    while (s < arrow && (isalnum((unsigned char)*s) || *s == '_') && ak < 63) arg[ak++] = *s++;
                    arg[ak] = 0;
                    if (ak > 0) strncpy(fn->args[fn->nargs++], arg, 63);
                    else if (s < arrow) s++; /* skip unknown char to avoid infinite loop */
                }

                /* Collect body (indented lines after) */
                fn->nbody = 0;
                int base_indent = ben_indent(lines[i]);
                int j = i + 1;
                while (j < nlines && fn->nbody < BEN_MAX_BODY) {
                    const char *bl = ben_trim(lines[j]);
                    if (!*bl || (bl[0] == '-' && bl[1] == '-')) { j++; continue; }
                    if (ben_indent(lines[j]) <= base_indent) break;
                    fn->body_lines[fn->nbody++] = lines[j];
                    j++;
                }
                funcs.count++;
                i = j - 1;
            }
        }
    }

    /* Second pass: execute bindings */
    for (int i = 0; i < nlines; i++) {
        const char *trimmed = ben_trim(lines[i]);
        if (!*trimmed || (trimmed[0] == '-' && trimmed[1] == '-')) continue;

        /* Skip test assertions (has 'is' token) */
        if (strstr(trimmed, " is ")) continue;

        /* Skip function definitions */
        const char *arrow = strstr(trimmed, "->");
        const char *colon = strchr(trimmed, ':');
        if (arrow && (!colon || colon > arrow)) {
            /* It's a function def, skip body */
            int base = ben_indent(lines[i]);
            int j = i + 1;
            while (j < nlines) {
                const char *bl = ben_trim(lines[j]);
                if (!*bl || (bl[0] == '-' && bl[1] == '-')) { j++; continue; }
                if (ben_indent(lines[j]) <= base) break;
                j++;
            }
            i = j - 1;
            continue;
        }

        /* Binding: name: expr  (name may start with _ for private vars) */
        if (colon && (isalpha((unsigned char)trimmed[0]) || trimmed[0] == '_')) {
            char name[64];
            int k = 0;
            const char *s = trimmed;
            while (*s && *s != ':' && k < 63) {
                if (*s != ' ' && *s != '\t') name[k++] = *s;
                s++;
            }
            name[k] = 0;
            if (*s == ':') {
                s++; /* skip : */
                s = ben_trim(s);
                BenVal val = ben_eval_expr(&interp, s);
                ben_env_set(&env, name, val);
            }
        }
    }

    /* Write back modified state to VM */
    if (vm) {
        BenVal *v;
        if ((v = ben_env_get(&env, "score")) && v->type == VAL_NUM) vm->vars[30] = v->num;
        if ((v = ben_env_get(&env, "fails")) && v->type == VAL_NUM) vm->vars[17] = v->num;
        if ((v = ben_env_get(&env, "etat")) && v->type == VAL_NUM) vm->vars[9] = v->num;
        if ((v = ben_env_get(&env, "decision")) && v->type == VAL_NUM) vm->vars[11] = v->num;
    }

    /* Copy log */
    if (log_out && log_max > 0) {
        int n = interp.log_len < log_max - 1 ? interp.log_len : log_max - 1;
        memcpy(log_out, interp.log, n);
        log_out[n] = 0;
    }

    free(src_copy);
    if (interp.arena_path) free(interp.arena_path);
    return 0;
}

/* ═══════ FILE EXECUTION: read .ben and execute ═══════ */
static int ben_exec_file(VM *vm, const char *filepath, const char *arena_path, char *log_out, int log_max) {
    FILE *f = fopen(filepath, "rb");
    if (!f) return -1;
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    if (sz <= 0 || sz > 512 * 1024) { fclose(f); return -1; }
    fseek(f, 0, SEEK_SET);
    char *src = malloc(sz + 1);
    fread(src, 1, sz, f);
    src[sz] = 0;
    fclose(f);

    int ret = ben_exec(vm, src, arena_path, log_out, log_max);
    free(src);
    return ret;
}

/* ═══════ STANDALONE TEST RUNNER ═══════
 * ben_run_test_file: run a .ben file, evaluate "is" assertions, print pass/fail.
 * Returns: number of failures (0 = all pass). */
static int ben_run_test_file(const char *filepath) {
    FILE *f = fopen(filepath, "rb");
    if (!f) { fprintf(stderr, "[test] cannot open %s\n", filepath); return 1; }
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    if (sz <= 0 || sz > 512 * 1024) { fclose(f); fprintf(stderr, "[test] file too large\n"); return 1; }
    fseek(f, 0, SEEK_SET);
    char *src = malloc(sz + 1);
    fread(src, 1, sz, f);
    src[sz] = 0;
    fclose(f);

    /* Split into lines */
    char *src_copy = strdup(src);
    free(src);
    char *lines_raw[BEN_MAX_LINES];
    int nlines = 0;
    char *p = src_copy;
    while (*p && nlines < BEN_MAX_LINES) {
        lines_raw[nlines] = p;
        char *nl = strchr(p, '\n');
        if (nl) { *nl = 0; p = nl + 1; }
        else p += strlen(p);
        int len = (int)strlen(lines_raw[nlines]);
        while (len > 0 && lines_raw[nlines][len-1] == '\r') lines_raw[nlines][--len] = 0;
        nlines++;
    }

    BenEnv env; memset(&env, 0, sizeof(env));
    BenFuncs funcs; memset(&funcs, 0, sizeof(funcs));
    BenInterp interp; memset(&interp, 0, sizeof(interp));
    interp.env = &env;
    interp.funcs = &funcs;
    interp.vm = NULL;
    interp.arena_path = NULL;

    /* Pass 1: collect function definitions */
    for (int i = 0; i < nlines; i++) {
        const char *trimmed = ben_trim(lines_raw[i]);
        if (!*trimmed || (trimmed[0] == '-' && trimmed[1] == '-')) continue;
        if (trimmed[0] == '_' || isalpha((unsigned char)trimmed[0])) {
            const char *arrow = strstr(trimmed, "->");
            if (arrow && funcs.count < BEN_MAX_FUNCS) {
                char first[64]; int k = 0;
                const char *s = trimmed;
                while (*s && (isalnum((unsigned char)*s) || *s == '_') && k < 63) first[k++] = *s++;
                first[k] = 0;
                const char *colon = strchr(trimmed, ':');
                if (colon && colon < arrow) continue;
                BenFunc *fn = &funcs.funcs[funcs.count];
                strncpy(fn->name, first, 63);
                fn->nargs = 0;
                s = ben_trim(s);
                while (s < arrow && fn->nargs < BEN_MAX_ARGS) {
                    while (s < arrow && (*s == ' ' || *s == ',' || *s == '\t')) s++;
                    if (s >= arrow) break;
                    char arg[64]; int ak = 0;
                    while (s < arrow && (isalnum((unsigned char)*s) || *s == '_') && ak < 63) arg[ak++] = *s++;
                    arg[ak] = 0;
                    if (ak > 0) strncpy(fn->args[fn->nargs++], arg, 63);
                    else if (s < arrow) s++;
                }
                fn->nbody = 0;
                int base_indent = ben_indent(lines_raw[i]);
                int j = i + 1;
                while (j < nlines && fn->nbody < BEN_MAX_BODY) {
                    const char *bl = ben_trim(lines_raw[j]);
                    if (!*bl || (bl[0] == '-' && bl[1] == '-')) { j++; continue; }
                    if (ben_indent(lines_raw[j]) <= base_indent) break;
                    fn->body_lines[fn->nbody++] = lines_raw[j];
                    j++;
                }
                funcs.count++;
                i = j - 1;
            }
        }
    }

    /* Pass 2: execute bindings (skip assertions) */
    for (int i = 0; i < nlines; i++) {
        const char *trimmed = ben_trim(lines_raw[i]);
        if (!*trimmed || (trimmed[0] == '-' && trimmed[1] == '-')) continue;
        if (strstr(trimmed, " is ")) continue;
        const char *arrow = strstr(trimmed, "->");
        const char *colon = strchr(trimmed, ':');
        if (arrow && (!colon || colon > arrow)) {
            int base = ben_indent(lines_raw[i]);
            int j = i + 1;
            while (j < nlines) {
                const char *bl = ben_trim(lines_raw[j]);
                if (!*bl || (bl[0] == '-' && bl[1] == '-')) { j++; continue; }
                if (ben_indent(lines_raw[j]) <= base) break;
                j++;
            }
            i = j - 1;
            continue;
        }
        if (colon && (isalpha((unsigned char)trimmed[0]) || trimmed[0] == '_')) {
            char name[64]; int k = 0;
            const char *s = trimmed;
            while (*s && *s != ':' && k < 63) {
                if (*s != ' ' && *s != '\t') name[k++] = *s;
                s++;
            }
            name[k] = 0;
            if (*s == ':') {
                s++; s = ben_trim(s);
                BenVal val = ben_eval_expr(&interp, s);
                ben_env_set(&env, name, val);
            }
        }
    }

    /* Pass 3: evaluate "is" assertions and print results */
    int pass = 0, fail = 0;
    printf("[test] %s\n", filepath);
    for (int i = 0; i < nlines; i++) {
        const char *trimmed = ben_trim(lines_raw[i]);
        if (!*trimmed || (trimmed[0] == '-' && trimmed[1] == '-')) continue;
        const char *is_tok = strstr(trimmed, " is ");
        if (!is_tok) continue;

        /* lhs: expression before " is " */
        char lhs_buf[BEN_MAX_STR];
        int llen = (int)(is_tok - trimmed);
        if (llen >= BEN_MAX_STR) llen = BEN_MAX_STR - 1;
        strncpy(lhs_buf, trimmed, llen);
        lhs_buf[llen] = 0;
        /* rhs: expected value after " is " */
        const char *rhs_str = ben_trim(is_tok + 4);

        BenVal actual = ben_eval_expr(&interp, lhs_buf);
        BenVal expected = ben_eval_expr(&interp, rhs_str);

        /* Compare */
        char actual_s[BEN_MAX_STR], expected_s[BEN_MAX_STR];
        if (actual.type == VAL_STR)
            snprintf(actual_s, BEN_MAX_STR, "%s", actual.str);
        else
            snprintf(actual_s, BEN_MAX_STR, "%.6g", actual.num);

        if (expected.type == VAL_STR)
            snprintf(expected_s, BEN_MAX_STR, "%s", expected.str);
        else
            snprintf(expected_s, BEN_MAX_STR, "%.6g", expected.num);

        /* Strip trailing zeros from numeric strings for comparison */
        int ok = (strcmp(actual_s, expected_s) == 0);
        /* Also try: if rhs looks like a quoted string, compare to unquoted */
        if (!ok && rhs_str[0] == '"') {
            /* expected was already evaluated (quotes stripped by ben_eval_expr) */
            ok = (strcmp(actual_s, expected_s) == 0);
        }
        /* Numeric fallback: if both parse as numbers, compare numerically */
        if (!ok) {
            char *end1, *end2;
            double d1 = strtod(actual_s, &end1);
            double d2 = strtod(expected_s, &end2);
            if (*end1 == 0 && *end2 == 0) ok = (d1 == d2);
        }

        if (ok) {
            printf("  PASS  %s  (= %s)\n", lhs_buf, actual_s);
            pass++;
        } else {
            printf("  FAIL  %s  got=%s  expected=%s\n", lhs_buf, actual_s, expected_s);
            fail++;
        }
    }

    printf("[test] %d pass, %d fail\n", pass, fail);
    free(src_copy);
    return fail;
}
