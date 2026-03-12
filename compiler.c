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
#include <stdlib.h>
#include <stdio.h>
#include <stdarg.h>
#include <ctype.h>
#include <math.h>

/* ═══════ LIMITS ═══════ */
#define BEN_MAX_LINES    512
#define BEN_MAX_VARS     64
#define BEN_MAX_FUNCS    32
#define BEN_MAX_ARGS     8
#define BEN_MAX_BODY     32
#define BEN_MAX_STR      512
#define BEN_MAX_STRTAB   256

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
                    /* Find the extent of this argument (handle nested parens) */
                    int depth = 0;
                    int arg_start = i;
                    char arg_buf[BEN_MAX_STR];
                    int ak = 0;
                    while (expr[i]) {
                        if (expr[i] == '(') depth++;
                        else if (expr[i] == ')') {
                            if (depth == 0) break;
                            depth--;
                        } else if (expr[i] == ',' && depth == 0) break;
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
        if (sid >= 0 && sid < MAX_SOCKETS && sock_table[sid] != INVALID_SOCKET) {
            char *buf = malloc(maxlen + 1);
            int n = recv(sock_table[sid], buf, maxlen, 0);
            if (n > 0) { buf[n] = 0; result = ben_str(buf); }
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

        /* Binding: name: expr */
        if (colon && isalpha((unsigned char)trimmed[0])) {
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
