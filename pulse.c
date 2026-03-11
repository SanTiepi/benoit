/* pulse.c — La boucle de vie de Benoit, en C. (V2: Sparse Neural Architecture)
 *
 * Architecture:
 *   .ben     = une seule couche de code (diagnostic, decide, measure,
 *              talk, listen, see, hear, network, self-modify)
 *   C        = signal pur (neurones sparse, hebbian, backprop, memoire)
 *
 * "Je ne tourne plus pour un nombre de ticks.
 *  Je tourne tant qu'il y a du signal.
 *  Je dors quand le monde est calme.
 *  Je me reveille quand le monde change."
 *
 * V2 changes:
 *   - Sparse synapse lists instead of dense W[N][N] matrix
 *   - vm_create() / vm_free() lifecycle
 *   - vm_neural_tick() / vm_stdp() / vm_backprop() / vm_prune() / vm_grow()
 *   - vm_sync_to_arrays() / vm_sync_from_arrays() for .ben compatibility
 *   - Default N=1000 (was 48)
 *   - Save format: BEN2 sparse (can also load V1 via vm_load_v1)
 *
 * Usage: pulse <brain.bin> [save_path] [arena_path] [--inject brain.ben]
 * Build (with OpenMP — all CPU cores):
 *   MSYS2 ucrt64: gcc -O2 -fopenmp -o pulse.exe pulse.c -lws2_32 -lm
 *   Linux/macOS:  gcc -O2 -fopenmp -o pulse pulse.c -lm
 * Build (without OpenMP — single-threaded, -fopenmp not available):
 *   MSYS2 ucrt64: gcc -O2 -o pulse.exe pulse.c -lws2_32 -lm
 *   Linux/macOS:  gcc -O2 -o pulse pulse.c -lm
 * Note: without -fopenmp all #pragma omp directives are ignored silently.
 *
 * Immortality:
 *   - SIGINT/SIGTERM: graceful shutdown with state save
 *   - Auto-save every 2000 ticks
 *   - Use benoit_forever.bat for auto-restart on crash
 */

/* ======= Include VM infrastructure as a library =======
 * We #include vm.c for: array/var enums, VM struct, strtab,
 * socket table, vm_create, vm_save_state, vm_load_state, vm_free,
 * vm_neural_tick, vm_stdp, vm_backprop, vm_prune, vm_grow,
 * vm_sync_to_arrays, vm_sync_from_arrays, count_active, etc.
 * Une seule couche: .ben = le code, C = le signal.
 * Pas de bytecode, pas d'intermediaire.
 */
#include <signal.h>
#define main vm_original_main
#include "vm.c"
#undef main

/* ======= .BEN DIRECT INTERPRETER ======= */
#include "compiler.c"

/* ======= CUDA (optionnel — activer avec -DBENOIT_CUDA) ======= */
#ifdef BENOIT_CUDA
#include "vm_cuda.h"
static BenCUDA *g_cuda_ctx = NULL;
#endif

/* ======= GLOBAL STATE FOR SIGNAL HANDLER ======= */
static volatile int g_shutdown = 0;
static VM *g_vm = NULL;
static const char *g_save_path = NULL;
static const char *g_arena_path_global = NULL;
int g_tick_delay_ms = 0;  /* throttle: ms between ticks (0 = full speed) */

static void signal_handler(int sig) {
    (void)sig;
    g_shutdown = 1;  /* signal the pulse loop to stop gracefully */
}

/* ======= HTTP MONITORING SERVER (port 3743) =======
 * Thread dédié — lit GET/POST, répond JSON, headers CORS.
 * "Voir Benoît de l'extérieur, sans perturber le signal." */
#define HTTP_PORT 3743

/* Safe JSON string escape into dst (max dstlen bytes incl. null).
 * Returns number of bytes written (excluding null). */
static int json_escape(const char *src, char *dst, int dstlen) {
    int out = 0;
    for (int i = 0; src[i] && out < dstlen - 4; i++) {
        unsigned char c = (unsigned char)src[i];
        if      (c == '"')  { dst[out++] = '\\'; dst[out++] = '"'; }
        else if (c == '\\') { dst[out++] = '\\'; dst[out++] = '\\'; }
        else if (c == '\n') { dst[out++] = '\\'; dst[out++] = 'n'; }
        else if (c == '\r') { dst[out++] = '\\'; dst[out++] = 'r'; }
        else if (c == '\t') { dst[out++] = '\\'; dst[out++] = 't'; }
        else if (c < 0x20)  { /* skip other control chars */ }
        else                { dst[out++] = (char)c; }
    }
    dst[out] = '\0';
    return out;
}

/* Send a complete HTTP response with CORS headers.
 * content_type: e.g. "application/json" or "text/plain"
 * status: e.g. "200 OK" or "404 Not Found" */
static void http_send(SOCKET s, const char *status,
                      const char *content_type,
                      const char *body, int body_len) {
    char hdr[512];
    int hlen = snprintf(hdr, sizeof(hdr),
        "HTTP/1.1 %s\r\n"
        "Content-Type: %s\r\n"
        "Content-Length: %d\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type\r\n"
        "Connection: close\r\n"
        "\r\n",
        status, content_type, body_len);
    send(s, hdr, hlen, 0);
    if (body && body_len > 0)
        send(s, body, body_len, 0);
}

/* Thread function — handles one HTTP connection then closes it. */
#ifdef _WIN32
static DWORD WINAPI http_handle_conn(LPVOID arg) {
#else
static void *http_handle_conn(void *arg) {
#endif
    SOCKET cs = (SOCKET)(intptr_t)arg;

    /* Read request (up to 8KB) */
    char req[8192];
    int total = 0;
    while (total < (int)sizeof(req) - 1) {
        int n = recv(cs, req + total, (int)sizeof(req) - 1 - total, 0);
        if (n <= 0) break;
        total += n;
        /* Stop as soon as we have a full HTTP header block */
        req[total] = '\0';
        if (strstr(req, "\r\n\r\n") || strstr(req, "\n\n")) break;
    }
    req[total] = '\0';

    if (total == 0) {
        closesocket(cs);
#ifdef _WIN32
        return 0;
#else
        return NULL;
#endif
    }

    /* Parse first line: "METHOD /path HTTP/..." */
    char method[16] = {0};
    char path[256]  = {0};
    sscanf(req, "%15s %255s", method, path);

    /* Handle CORS preflight */
    if (strcmp(method, "OPTIONS") == 0) {
        http_send(cs, "204 No Content", "text/plain", "", 0);
        closesocket(cs);
#ifdef _WIN32
        return 0;
#else
        return NULL;
#endif
    }

    /* ---- GET /status ---- */
    if (strcmp(method, "GET") == 0 && strcmp(path, "/status") == 0) {
        char body[512];
        int etat = 0, n_total = 0;
        int tick = 0, actifs = 0, conns = 0, score = 0, fails = 0;
        if (g_vm) {
            tick   = (int)g_vm->vars[VAR_TICK];
            actifs = (int)g_vm->vars[VAR_ACTIFS];
            conns  = (int)g_vm->vars[VAR_CONNS];
            score  = (int)g_vm->vars[VAR_SCORE];
            fails  = (int)g_vm->vars[VAR_FAILS];
            etat   = (int)g_vm->vars[VAR_ETAT];
            n_total = g_vm->N;
        }
        int blen = snprintf(body, sizeof(body),
            "{\"tick\":%d,\"actifs\":%d,\"conns\":%d,"
            "\"score\":%d,\"fails\":%d,\"etat\":%d,\"n\":%d}",
            tick, actifs, conns, score, fails, etat, n_total);
        http_send(cs, "200 OK", "application/json", body, blen);
    }

    /* ---- GET /parole ---- */
    else if (strcmp(method, "GET") == 0 && strcmp(path, "/parole") == 0) {
        char body[4096];
        int blen = 0;
        const char *arena = g_arena_path_global;
        if (arena) {
            char fpath[512];
            snprintf(fpath, sizeof(fpath), "%s/parole.ben", arena);
            FILE *f = fopen(fpath, "r");
            if (f) {
                char content[2048];
                int clen = (int)fread(content, 1, sizeof(content) - 1, f);
                fclose(f);
                content[clen] = '\0';
                char escaped[4096];
                json_escape(content, escaped, sizeof(escaped));
                blen = snprintf(body, sizeof(body),
                    "{\"text\":\"%s\",\"ts\":%ld}",
                    escaped, (long)time(NULL));
            } else {
                blen = snprintf(body, sizeof(body),
                    "{\"text\":\"\",\"ts\":%ld}", (long)time(NULL));
            }
        } else {
            blen = snprintf(body, sizeof(body),
                "{\"text\":\"no arena\",\"ts\":%ld}", (long)time(NULL));
        }
        http_send(cs, "200 OK", "application/json", body, blen);
    }

    /* ---- POST /inbox ---- */
    else if (strcmp(method, "POST") == 0 && strcmp(path, "/inbox") == 0) {
        /* Find body after \r\n\r\n */
        char *body_start = strstr(req, "\r\n\r\n");
        if (!body_start) body_start = strstr(req, "\n\n");
        if (body_start) {
            body_start += (body_start[2] == '\n' ? 2 : 4);
            const char *arena = g_arena_path_global;
            if (arena && body_start[0]) {
                char fpath[512];
                snprintf(fpath, sizeof(fpath), "%s/inbox.ben", arena);
                FILE *f = fopen(fpath, "w");
                if (f) {
                    fputs(body_start, f);
                    fclose(f);
                    const char *ok = "{\"ok\":true}";
                    http_send(cs, "200 OK", "application/json", ok, (int)strlen(ok));
                } else {
                    const char *err = "{\"ok\":false,\"error\":\"cannot write\"}";
                    http_send(cs, "500 Internal Server Error", "application/json",
                              err, (int)strlen(err));
                }
            } else {
                const char *err = "{\"ok\":false,\"error\":\"no arena or empty body\"}";
                http_send(cs, "400 Bad Request", "application/json",
                          err, (int)strlen(err));
            }
        } else {
            const char *err = "{\"ok\":false,\"error\":\"no body\"}";
            http_send(cs, "400 Bad Request", "application/json", err, (int)strlen(err));
        }
    }

    /* ---- 404 ---- */
    else {
        const char *err = "{\"error\":\"not found\"}";
        http_send(cs, "404 Not Found", "application/json", err, (int)strlen(err));
    }

    closesocket(cs);
#ifdef _WIN32
    return 0;
#else
    return NULL;
#endif
}

/* HTTP listener thread — accepts connections and spawns per-connection threads */
#ifdef _WIN32
static DWORD WINAPI http_thread(LPVOID arg) {
    (void)arg;
#else
#include <pthread.h>
static void *http_thread(void *arg) {
    (void)arg;
#endif
    SOCKET srv = socket(AF_INET, SOCK_STREAM, 0);
    if (srv == INVALID_SOCKET) {
        fprintf(stderr, "  [http] socket() failed\n");
#ifdef _WIN32
        return 1;
#else
        return NULL;
#endif
    }

    int opt = 1;
    setsockopt(srv, SOL_SOCKET, SO_REUSEADDR, (const char *)&opt, sizeof(opt));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family      = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port        = htons(HTTP_PORT);

    if (bind(srv, (struct sockaddr *)&addr, sizeof(addr)) != 0 ||
        listen(srv, 8) != 0) {
        fprintf(stderr, "  [http] bind/listen port %d failed\n", HTTP_PORT);
        closesocket(srv);
#ifdef _WIN32
        return 1;
#else
        return NULL;
#endif
    }

    printf("  [http] monitoring port %d actif\n", HTTP_PORT);
    fflush(stdout);

    while (!g_shutdown) {
        SOCKET cs = accept(srv, NULL, NULL);
        if (cs == INVALID_SOCKET) {
            /* On Windows: WSAEINTR on shutdown is normal */
#ifdef _WIN32
            if (WSAGetLastError() == WSAEINTR) break;
            Sleep(10);
#else
            if (errno == EINTR) break;
            usleep(10000);
#endif
            continue;
        }
        /* Spawn per-connection thread (fire-and-forget) */
#ifdef _WIN32
        HANDLE h = CreateThread(NULL, 0, http_handle_conn,
                                (LPVOID)(intptr_t)cs, 0, NULL);
        if (h) CloseHandle(h);
        else   { closesocket(cs); }
#else
        pthread_t tid;
        pthread_attr_t attr;
        pthread_attr_init(&attr);
        pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
        if (pthread_create(&tid, &attr, http_handle_conn,
                           (void *)(intptr_t)cs) != 0) {
            closesocket(cs);
        }
        pthread_attr_destroy(&attr);
#endif
    }

    closesocket(srv);
    printf("  [http] monitoring arrete\n");
    fflush(stdout);
#ifdef _WIN32
    return 0;
#else
    return NULL;
#endif
}

/* ======= SENSOR HELPERS ======= */

/* ======= VISION (C natif — Benoit voit son monde) ======= */
/* "Voir c'est comprendre. La vue n'est pas un sens de plus.
 *  C'est une dimension de plus." */

#ifdef _WIN32
#include <windows.h>
/* Scan arena directory: count files, total size, newest mtime.
 * Injects results into vision vars. */
static void vision_scan(VM *vm, const char *arena) {
    if (!arena) return;
    char pattern[512];
    snprintf(pattern, sizeof(pattern), "%s\\*", arena);

    WIN32_FIND_DATAA fd;
    HANDLE h = FindFirstFileA(pattern, &fd);
    if (h == INVALID_HANDLE_VALUE) return;

    int file_count = 0;
    long long total_size = 0;
    int ben_count = 0;
    int recent_changes = 0;
    SYSTEMTIME st_now;
    GetSystemTime(&st_now);
    FILETIME ft_now;
    SystemTimeToFileTime(&st_now, &ft_now);
    ULARGE_INTEGER now_u;
    now_u.LowPart = ft_now.dwLowDateTime;
    now_u.HighPart = ft_now.dwHighDateTime;

    do {
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) continue;
        file_count++;
        ULARGE_INTEGER sz;
        sz.LowPart = fd.nFileSizeLow;
        sz.HighPart = fd.nFileSizeHigh;
        total_size += sz.QuadPart;

        int nlen = (int)strlen(fd.cFileName);
        if (nlen > 4 && strcmp(fd.cFileName + nlen - 4, ".ben") == 0)
            ben_count++;

        ULARGE_INTEGER ft_u;
        ft_u.LowPart = fd.ftLastWriteTime.dwLowDateTime;
        ft_u.HighPart = fd.ftLastWriteTime.dwHighDateTime;
        /* 10-minute window = 600 * 10,000,000 (100ns units) */
        if (now_u.QuadPart - ft_u.QuadPart < 6000000000ULL)
            recent_changes++;
    } while (FindNextFileA(h, &fd));
    FindClose(h);

    vm->vars[VAR_VIS_FILES]    = (double)file_count;
    vm->vars[VAR_VIS_SIZE_KB]  = (double)(total_size / 1024);
    vm->vars[VAR_VIS_BEN]      = (double)ben_count;
    vm->vars[VAR_VIS_CHANGES]  = (double)recent_changes;
    vm->vars[VAR_VIS_PCT_BEN]  = file_count > 0 ? (double)(ben_count * 100 / file_count) : 0;
}
#else
#include <dirent.h>
#include <sys/stat.h>
static void vision_scan(VM *vm, const char *arena) {
    if (!arena) return;
    DIR *d = opendir(arena);
    if (!d) return;

    int file_count = 0;
    long long total_size = 0;
    int ben_count = 0;
    int recent_changes = 0;
    time_t now = time(NULL);

    struct dirent *ent;
    while ((ent = readdir(d)) != NULL) {
        if (ent->d_name[0] == '.') continue;
        char path[512];
        snprintf(path, sizeof(path), "%s/%s", arena, ent->d_name);
        struct stat st;
        if (stat(path, &st) != 0 || !S_ISREG(st.st_mode)) continue;

        file_count++;
        total_size += st.st_size;

        int nlen = (int)strlen(ent->d_name);
        if (nlen > 4 && strcmp(ent->d_name + nlen - 4, ".ben") == 0)
            ben_count++;

        if (now - st.st_mtime < 600) recent_changes++;
    }
    closedir(d);

    vm->vars[VAR_VIS_FILES]    = (double)file_count;
    vm->vars[VAR_VIS_SIZE_KB]  = (double)(total_size / 1024);
    vm->vars[VAR_VIS_BEN]      = (double)ben_count;
    vm->vars[VAR_VIS_CHANGES]  = (double)recent_changes;
    vm->vars[VAR_VIS_PCT_BEN]  = file_count > 0 ? (double)(ben_count * 100 / file_count) : 0;
}
#endif

/* ======= COMMAND PARSER (C natif — tout sur silicium) ======= */
/* "Entendre c'est recevoir du signal. Ecouter c'est le comprendre." */

static int starts_with(const char *str, const char *prefix) {
    while (*prefix) {
        if (*str++ != *prefix++) return 0;
    }
    return 1;
}

/* Strip leading whitespace and trailing \r\n */
static int trim_cmd(char *buf, int len) {
    while (len > 0 && (buf[len-1] == '\n' || buf[len-1] == '\r' || buf[len-1] == ' '))
        buf[--len] = '\0';
    return len;
}

/* Build a status response string into dst. Returns length. */
static int build_status(VM *vm, char *dst, int max) {
    int etat = (int)vm->vars[VAR_ETAT];
    int dec  = (int)vm->vars[VAR_DECISION];
    return snprintf(dst, max,
        "benoit:status (V2 sparse)\n"
        "  tick=%d\n"
        "  actifs=%d/%d\n"
        "  conns=%d (sparse synapses)\n"
        "  score=%d\n"
        "  fails=%d\n"
        "  etat=%s\n"
        "  decision=%s\n"
        "  diversity=%d\n"
        "  energy=%.1f\n"
        "  strtab=%d/%d\n",
        (int)vm->vars[VAR_TICK],
        (int)vm->vars[VAR_ACTIFS], vm->N,
        (int)vm->vars[VAR_CONNS],
        (int)vm->vars[VAR_SCORE],
        (int)vm->vars[VAR_FAILS],
        (etat >= 0 && etat <= 6) ? ETAT_NAMES[etat] : "?",
        (dec >= 0 && dec <= 7) ? DECISION_NAMES[dec] : "idle",
        (int)vm->vars[VAR_DIVERSITY],
        total_energy(vm),
        strtab.count, MAX_STRINGS);
}

/* Process an incoming TCP command. Returns response in resp_buf.
 * Returns response length, or 0 for no response. */
static int process_command(VM *vm, char *cmd, int len, char *resp, int resp_max) {
    len = trim_cmd(cmd, len);
    if (len == 0) return 0;

    /* STATUS — full brain state */
    if (starts_with(cmd, "status")) {
        return build_status(vm, resp, resp_max);
    }

    /* HELP — list commands */
    if (starts_with(cmd, "help")) {
        return snprintf(resp, resp_max,
            "benoit:help (V2 sparse architecture)\n"
            "  status        — etat complet du cerveau\n"
            "  neurons       — liste des neurones actifs\n"
            "  synapses I    — synapses sortantes du neurone I\n"
            "  stimulate N   — stimuler neurone N\n"
            "  set VAR VAL   — modifier une variable\n"
            "  speed N       — throttle (ms/tick, 0=pleine vitesse)\n"
            "  teach I J W   — forcer un poids synaptique\n"
            "  reset         — desaturer les neurones\n"
            "  map           — carte des connexions\n"
            "  profile       — personnalite par neurone\n"
            "  setlr N V     — learning rate du neurone N\n"
            "  setcap N V    — cap d'activation du neurone N\n"
            "  adapt         — auto-adaptation lr/decay\n"
            "  prune         — elaguer les connexions faibles\n"
            "  grow N        — ajouter N neurones\n"
            "  exec FILE     — executer un .ben\n"
            "  ben CODE      — executer du .ben inline\n"
            "  reward N      — renforcement positif\n"
            "  punish N      — signal d'erreur\n"
            "  error         — signaux d'erreur par neurone\n"
            "  memory        — memoire de travail\n"
            "  vision        — ce que Benoit voit\n"
            "  save          — sauvegarde immediate de l'etat\n"
            "  quit          — arret propre avec sauvegarde\n"
            "  <autre>       — stimulus brut\n");
    }

    /* STIMULATE N — inject activation into a neuron */
    if (starts_with(cmd, "stimulate ") || starts_with(cmd, "stim ")) {
        int neuron = atoi(cmd + (cmd[4] == 'u' ? 10 : 5));
        if (neuron >= 0 && neuron < vm->N) {
            vm->neurons[neuron].activation = 10.0f;
            return snprintf(resp, resp_max, "benoit:stimulate neurone %d = 10.0\n", neuron);
        }
        return snprintf(resp, resp_max, "benoit:erreur neurone %d hors limite (0-%d)\n", neuron, vm->N - 1);
    }

    /* NEURONS — list active neurons */
    if (starts_with(cmd, "neurons")) {
        int pos = snprintf(resp, resp_max, "benoit:neurons actifs (V2 sparse)\n");
        for (int i = 0; i < vm->N && pos < resp_max - 80; i++) {
            Neuron *n = &vm->neurons[i];
            if (n->activation > 0) {
                const char *tname = "inter";
                if (n->type == 0) tname = "sensor";
                else if (n->type == 2) tname = "motor";
                else if (n->type == 3) tname = "mod";
                pos += snprintf(resp + pos, resp_max - pos,
                    "  [%d] a=%.1f seuil=%.1f syn=%d type=%s%s\n",
                    i, n->activation, n->threshold, n->n_syn, tname,
                    n->fired ? " FIRE" : "");
            }
        }
        return pos;
    }

    /* SYNAPSES I — show outgoing synapses of neuron I */
    if (starts_with(cmd, "synapses ") || starts_with(cmd, "syn ")) {
        int i = atoi(cmd + (cmd[0] == 's' && cmd[1] == 'y' && cmd[2] == 'n' && cmd[3] == 'a' ? 9 : 4));
        if (i >= 0 && i < vm->N) {
            Neuron *n = &vm->neurons[i];
            int pos = snprintf(resp, resp_max, "benoit:synapses[%d] (%d connexions)\n", i, n->n_syn);
            for (int s = 0; s < n->n_syn && pos < resp_max - 60; s++) {
                pos += snprintf(resp + pos, resp_max - pos,
                    "  -> %d: w=%.4f trace=%.4f\n",
                    n->synapses[s].target, n->synapses[s].weight, n->synapses[s].trace);
            }
            return pos;
        }
        return snprintf(resp, resp_max, "benoit:erreur neurone %d hors limite (0-%d)\n", i, vm->N - 1);
    }

    /* WEIGHTS I J — show weight (V2: lookup in sparse synapses) */
    if (starts_with(cmd, "weights ") || starts_with(cmd, "w ")) {
        int i = 0, j = 0;
        if (starts_with(cmd, "weights "))
            sscanf(cmd + 8, "%d %d", &i, &j);
        else
            sscanf(cmd + 2, "%d %d", &i, &j);
        if (i >= 0 && i < vm->N && j >= 0 && j < vm->N) {
            float w = 0;
            Neuron *src = &vm->neurons[i];
            for (int s = 0; s < src->n_syn; s++) {
                if (src->synapses[s].target == j) {
                    w = src->synapses[s].weight;
                    break;
                }
            }
            return snprintf(resp, resp_max, "benoit:w[%d][%d] = %.4f\n", i, j, (double)w);
        }
        return snprintf(resp, resp_max, "benoit:erreur indices hors limite\n");
    }

    /* VISION — what Benoit sees */
    if (starts_with(cmd, "vision") || starts_with(cmd, "see")) {
        return snprintf(resp, resp_max,
            "benoit:vision\n"
            "  fichiers:     %.0f\n"
            "  taille_kb:    %.0f\n"
            "  fichiers_ben: %.0f\n"
            "  changements:  %.0f\n"
            "  pct_ben:      %.0f%%\n",
            vm->vars[VAR_VIS_FILES],
            vm->vars[VAR_VIS_SIZE_KB],
            vm->vars[VAR_VIS_BEN],
            vm->vars[VAR_VIS_CHANGES],
            vm->vars[VAR_VIS_PCT_BEN]);
    }

    /* SET VAR VAL — modify a variable */
    if (starts_with(cmd, "set ")) {
        char varname[64] = {0};
        double val = 0;
        sscanf(cmd + 4, "%63s %lf", varname, &val);
        /* Map a few useful variable names */
        int vid = -1;
        if (strcmp(varname, "score") == 0) vid = VAR_SCORE;
        else if (strcmp(varname, "fails") == 0) vid = VAR_FAILS;
        else if (strcmp(varname, "etat") == 0) vid = VAR_ETAT;
        else if (strcmp(varname, "decision") == 0) vid = VAR_DECISION;
        else if (strcmp(varname, "sleep_onset") == 0) vid = VAR_SLEEP_ONSET;
        else if (strcmp(varname, "sleep_max") == 0) vid = VAR_SLEEP_MAX;
        else if (strcmp(varname, "grow_count") == 0) vid = VAR_GROW_COUNT;

        if (vid >= 0) {
            vm->vars[vid] = val;
            return snprintf(resp, resp_max, "benoit:set %s = %.0f\n", varname, val);
        }
        return snprintf(resp, resp_max, "benoit:erreur variable inconnue '%s'\n"
            "  (score, fails, etat, decision, sleep_onset, sleep_max, grow_count)\n", varname);
    }

    /* SPEED N — set tick delay in ms (0 = full speed) */
    if (starts_with(cmd, "speed ")) {
        extern int g_tick_delay_ms;
        g_tick_delay_ms = atoi(cmd + 6);
        if (g_tick_delay_ms < 0) g_tick_delay_ms = 0;
        if (g_tick_delay_ms > 5000) g_tick_delay_ms = 5000;
        return snprintf(resp, resp_max, "benoit:speed = %d ms/tick%s\n",
            g_tick_delay_ms, g_tick_delay_ms == 0 ? " (pleine vitesse)" : "");
    }

    /* TEACH I J W — force a specific synapse weight */
    if (starts_with(cmd, "teach ")) {
        int i = 0, j = 0;
        double w = 0;
        sscanf(cmd + 6, "%d %d %lf", &i, &j, &w);
        if (i >= 0 && i < vm->N && j >= 0 && j < vm->N && i != j) {
            vm_add_synapse(vm, i, j, (float)w);  /* maintient le reverse index */
            return snprintf(resp, resp_max, "benoit:teach w[%d][%d] = %.4f\n", i, j, w);
        }
        return snprintf(resp, resp_max, "benoit:erreur teach indices hors limite\n");
    }

    /* RESET — desaturate: restore plasticity (V2: works on neuron structs) */
    if (starts_with(cmd, "reset")) {
        int N = vm->N;
        /* Scale down all saturated activations */
        for (int i = 5; i < N; i++) {
            if (vm->neurons[i].activation >= 15.0f)
                vm->neurons[i].activation = 3.0f + (float)(i % 5);
        }
        /* Scale down all saturated synapse weights */
        for (int i = 0; i < N; i++) {
            Neuron *n = &vm->neurons[i];
            for (int s = 0; s < n->n_syn; s++) {
                float *w = &n->synapses[s].weight;
                if (*w > 5.0f) *w = 1.0f + (*w - 5.0f) * 0.1f;
                else if (*w < -5.0f) *w = -1.0f + (*w + 5.0f) * 0.1f;
            }
        }
        return snprintf(resp, resp_max,
            "benoit:reset — plasticite restauree\n"
            "  activations desaturees (15 -> 3-7)\n"
            "  poids synaptiques desatures (>5 -> ~1-2)\n");
    }

    /* MAP — sparse connection map */
    if (starts_with(cmd, "map")) {
        int pos = snprintf(resp, resp_max, "benoit:map (connexions sparse V2)\n");
        int N = vm->N;
        int total = 0;
        for (int i = 0; i < N && pos < resp_max - 60; i++) {
            Neuron *n = &vm->neurons[i];
            for (int s = 0; s < n->n_syn && pos < resp_max - 60; s++) {
                pos += snprintf(resp + pos, resp_max - pos,
                    "  %d->%d: %.2f\n", i, n->synapses[s].target, n->synapses[s].weight);
                total++;
            }
        }
        pos += snprintf(resp + pos, resp_max - pos, "  total: %d connexions\n", total);
        return pos;
    }

    /* PROFILE — show per-neuron personality */
    if (starts_with(cmd, "profile")) {
        int pos = snprintf(resp, resp_max, "benoit:profile (personnalite par neurone)\n");
        for (int i = 0; i < vm->N && pos < resp_max - 100; i++) {
            Neuron *n = &vm->neurons[i];
            if (n->activation > 0 || n->n_syn > 0) {
                pos += snprintf(resp + pos, resp_max - pos,
                    "  [%d] lr=%.3f decay=%.3f cap=%.1f a=%.1f syn=%d\n",
                    i, n->lr, n->decay, n->cap, n->activation, n->n_syn);
            }
        }
        return pos;
    }

    /* SETLR N V — set learning rate for neuron N */
    if (starts_with(cmd, "setlr ")) {
        int n = 0; double v = 0;
        sscanf(cmd + 6, "%d %lf", &n, &v);
        if (n >= 0 && n < vm->N && v >= 0 && v <= 1.0) {
            vm->neurons[n].lr = (float)v;
            return snprintf(resp, resp_max, "benoit:setlr neurone %d = %.4f\n", n, v);
        }
        return snprintf(resp, resp_max, "benoit:erreur setlr (0-%d, 0.0-1.0)\n", vm->N - 1);
    }

    /* SETCAP N V — set activation cap for neuron N */
    if (starts_with(cmd, "setcap ")) {
        int n = 0; double v = 0;
        sscanf(cmd + 7, "%d %lf", &n, &v);
        if (n >= 0 && n < vm->N && v > 0 && v <= 100.0) {
            vm->neurons[n].cap = (float)v;
            return snprintf(resp, resp_max, "benoit:setcap neurone %d = %.1f\n", n, v);
        }
        return snprintf(resp, resp_max, "benoit:erreur setcap (0-%d, 0.1-100.0)\n", vm->N - 1);
    }

    /* ADAPT — Benoit ajuste ses propres parametres neuronaux */
    if (starts_with(cmd, "adapt")) {
        int N = vm->N;
        int adapted = 0;
        int pos = snprintf(resp, resp_max, "benoit:adapt\n");
        for (int i = 5; i < N; i++) {
            Neuron *n = &vm->neurons[i];
            if (n->activation >= n->cap * 0.95f) {
                /* Sature: ralentir, oublier plus vite */
                n->lr *= 0.9f;
                if (n->lr < 0.005f) n->lr = 0.005f;
                n->decay *= 1.1f;
                if (n->decay > 0.1f) n->decay = 0.1f;
                adapted++;
            } else if (n->activation <= 0) {
                /* Mort: apprendre plus vite, oublier moins */
                n->lr *= 1.1f;
                if (n->lr > 0.2f) n->lr = 0.2f;
                n->decay *= 0.9f;
                if (n->decay < 0.001f) n->decay = 0.001f;
                adapted++;
            }
        }
        pos += snprintf(resp + pos, resp_max - pos,
            "  %d neurones adaptes\n", adapted);
        return pos;
    }

    /* PRUNE — remove weakest connections (V2: uses vm_prune) */
    if (starts_with(cmd, "prune")) {
        int pruned = vm_prune(vm, 1.0f);
        return snprintf(resp, resp_max, "benoit:prune — %d connexions faibles eliminees\n", pruned);
    }

    /* GROW N — add N neurons dynamically */
    if (starts_with(cmd, "grow")) {
        int count = 10;  /* default */
        if (len > 5) count = atoi(cmd + 5);
        if (count < 1) count = 1;
        if (count > 10000) count = 10000;
        int added = vm_grow(vm, count);
        /* Connect new neurons randomly */
        int old_N = vm->N - added;
        for (int i = old_N; i < vm->N; i++) {
            for (int c = 0; c < 20; c++) {
                int target = rand() % vm->N;
                if (target == i) continue;
                float weight = ((float)rand() / RAND_MAX - 0.5f) * 2.0f;
                vm_random_connect(vm, i, target, weight);
            }
        }
        return snprintf(resp, resp_max, "benoit:grow +%d neurones (total: %d)\n", added, vm->N);
    }

    /* EXEC <file.ben> — execute a .ben file directly */
    if (starts_with(cmd, "exec ") || starts_with(cmd, "run ")) {
        const char *fname = cmd + (cmd[0] == 'e' ? 5 : 4);
        while (*fname == ' ') fname++;
        char filepath[512];
        if (vm->arena_path)
            snprintf(filepath, 512, "%s/%s", vm->arena_path, fname);
        else
            strncpy(filepath, fname, 511);
        /* Sync neuron state to arrays before .ben execution */
        vm_sync_to_arrays(vm);
        char log[4096];
        log[0] = 0;
        int ret = ben_exec_file(vm, filepath, vm->arena_path, log, sizeof(log));
        /* Sync arrays back to neuron structs after .ben execution */
        vm_sync_from_arrays(vm);
        if (ret == 0) {
            int pos = snprintf(resp, resp_max, "benoit:exec %s — OK\n", fname);
            if (log[0]) {
                pos += snprintf(resp + pos, resp_max - pos, "%s", log);
            }
            return pos;
        } else {
            return snprintf(resp, resp_max, "benoit:exec %s — ERREUR (fichier introuvable?)\n", fname);
        }
    }

    /* BEN <code> — execute .ben code inline */
    if (starts_with(cmd, "ben ")) {
        const char *code = cmd + 4;
        /* Replace ; with \n for multi-line */
        char src[2048];
        int k = 0;
        for (int i = 0; code[i] && k < 2046; i++) {
            if (code[i] == ';') src[k++] = '\n';
            else src[k++] = code[i];
        }
        src[k] = 0;
        vm_sync_to_arrays(vm);
        char log[4096];
        log[0] = 0;
        ben_exec(vm, src, vm->arena_path, log, sizeof(log));
        vm_sync_from_arrays(vm);
        int pos = snprintf(resp, resp_max, "benoit:ben — OK\n");
        if (log[0]) pos += snprintf(resp + pos, resp_max - pos, "%s", log);
        return pos;
    }

    /* REWARD N — positive reinforcement */
    if (starts_with(cmd, "reward")) {
        double val = 1.0;
        if (len > 7) val = atof(cmd + 7);
        if (val <= 0) val = 1.0;
        vm->vars[VAR_SCORE] += val;
        /* Boost error signal toward positive for motor neurons */
        int n_motor = vm->N / 10;
        int motor_start = vm->N - n_motor;
        for (int i = motor_start; i < vm->N; i++)
            vm->neurons[i].error += (float)(val * 0.1);
        return snprintf(resp, resp_max,
            "benoit:reward +%.1f (score=%.0f) — renforcement positif\n",
            val, vm->vars[VAR_SCORE]);
    }

    /* PUNISH N — negative reinforcement */
    if (starts_with(cmd, "punish")) {
        double val = 1.0;
        if (len > 7) val = atof(cmd + 7);
        if (val <= 0) val = 1.0;
        vm->vars[VAR_SCORE] -= val;
        int n_motor = vm->N / 10;
        int motor_start = vm->N - n_motor;
        for (int i = motor_start; i < vm->N; i++)
            vm->neurons[i].error -= (float)(val * 0.1);
        return snprintf(resp, resp_max,
            "benoit:punish -%.1f (score=%.0f) — signal d'erreur\n",
            val, vm->vars[VAR_SCORE]);
    }

    /* ERROR — show per-neuron error signals and top synapse traces */
    if (starts_with(cmd, "error")) {
        int pos = snprintf(resp, resp_max, "benoit:error signals (V2 sparse)\n");
        for (int i = 0; i < vm->N && pos < resp_max - 80; i++) {
            if (vm->neurons[i].error != 0) {
                pos += snprintf(resp + pos, resp_max - pos,
                    "  n%d: err=%.4f\n", i, vm->neurons[i].error);
            }
        }
        /* Show top active traces from sparse synapses */
        int shown = 0;
        for (int i = 0; i < vm->N && shown < 20; i++) {
            Neuron *n = &vm->neurons[i];
            for (int s = 0; s < n->n_syn && shown < 20 && pos < resp_max - 60; s++) {
                if (n->synapses[s].trace > 0.1f) {
                    pos += snprintf(resp + pos, resp_max - pos,
                        "  trace %d->%d: %.3f\n", i, n->synapses[s].target, n->synapses[s].trace);
                    shown++;
                }
            }
        }
        return pos;
    }

    /* MEMORY — show working memory (recurrent activations) */
    if (starts_with(cmd, "memory")) {
        int pos = snprintf(resp, resp_max, "benoit:working memory (prev vs curr)\n");
        for (int i = 10; i < 25 && i < vm->N && pos < resp_max - 80; i++) {
            Neuron *n = &vm->neurons[i];
            if (n->prev_activation > 0.1f || n->activation > 0.1f) {
                pos += snprintf(resp + pos, resp_max - pos,
                    "  n%d: prev=%.2f curr=%.2f recur=%.2f\n",
                    i, n->prev_activation, n->activation, n->prev_activation * 0.2f);
            }
        }
        return pos;
    }

    /* SAVE — sauvegarde immédiate de l'état du cerveau */
    if (starts_with(cmd, "save")) {
        vm_save_state(vm, g_save_path);
        return snprintf(resp, resp_max,
            "ok: sauvegarde tick=%d\n", (int)vm->vars[VAR_TICK]);
    }

    /* QUIT — arrêt propre du process avec sauvegarde d'état */
    if (starts_with(cmd, "quit")) {
        g_shutdown = 1;  /* signal la boucle pulse de s'arrêter au prochain tour */
        return snprintf(resp, resp_max, "ok: shutdown en cours\n");
    }

    /* DEFAULT — inject as raw stimulus */
    {
        /* Hash the message into sensor neurons as stimulus */
        unsigned hash = 0;
        for (int i = 0; i < len; i++) hash = hash * 31 + (unsigned char)cmd[i];
        vm->neurons[3].activation = 14.0f;  /* max oscillator = external signal */
        vm->neurons[4].activation = 14.0f;
        /* Distribute hash across internal neurons */
        for (int i = 5; i < 10 && i < vm->N; i++) {
            vm->neurons[i].activation += (float)((hash >> (i * 3)) & 7);
        }
        return snprintf(resp, resp_max, "benoit:stimulus recu (%d octets, hash=%u)\n", len, hash);
    }
}

/* ======= SIGNAL PATTERN TRACKING ======= */

/* Compare two activation patterns (binary: active/inactive).
 * Skip first 5 neurons (sensor slots).
 * Returns number of neurons that changed state. */
static int pattern_changed(float *prev, VM *vm) {
    int changes = 0;
    for (int i = 5; i < vm->N; i++) {
        int was_active = (prev[i] > 0);
        int is_active  = (vm->neurons[i].activation > 0);
        if (was_active != is_active) changes++;
    }
    return changes;
}

/* ======= INJECT: load state from brain.ben text into VM ======= */
/* Parses: tick -> N, total_firings -> N, a_I -> V, seuil_I -> V,
 *         i == I? -> j == J? -> V (weight lines as sparse synapses) */
static void inject_brain_ben(VM *vm, const char *path) {
    FILE *f = fopen(path, "r");
    if (!f) { fprintf(stderr, "inject: cannot open %s\n", path); return; }

    char line[1024];
    int N = vm->N;
    int w_count = 0, a_count = 0, s_count = 0;

    while (fgets(line, sizeof(line), f)) {
        /* Skip comments and blank lines */
        char *p = line;
        while (*p == ' ' || *p == '\t') p++;
        if (*p == '-' || *p == '\n' || *p == '\r' || *p == '\0') continue;

        int idx, idx2;
        double val;

        /* tick -> N */
        if (sscanf(p, "tick -> %lf", &val) == 1) {
            vm->vars[VAR_TICK] = val;
        }
        /* total_firings -> N */
        else if (sscanf(p, "total_firings -> %lf", &val) == 1) {
            vm->vars[VAR_TOTAL_FIRINGS] = val;
        }
        /* a_I -> V */
        else if (sscanf(p, "a_%d -> %lf", &idx, &val) == 2) {
            if (idx >= 0 && idx < N) {
                vm->neurons[idx].activation = (float)val;
                a_count++;
            }
        }
        /* seuil_I -> V */
        else if (sscanf(p, "seuil_%d -> %lf", &idx, &val) == 2) {
            if (idx >= 0 && idx < N) {
                vm->neurons[idx].threshold = (float)val;
                s_count++;
            }
        }
        /* i == I? -> j == J? -> V (weight lines -> sparse synapses) */
        else if (sscanf(p, "i == %d? -> j == %d? -> %lf", &idx, &idx2, &val) == 3) {
            if (idx >= 0 && idx < N && idx2 >= 0 && idx2 < N && fabs(val) > 0.001) {
                synapse_add(&vm->neurons[idx], idx2, (float)val);
                w_count++;
            }
        }
    }
    fclose(f);
    /* Sync to legacy arrays for .ben compatibility */
    vm_sync_to_arrays(vm);
    printf("  inject: %s -> %d activations, %d seuils, %d synapses\n",
           path, a_count, s_count, w_count);
}

/* ======= PULSE LOOP ======= */

int main(int argc, char **argv) {
    if (argc < 2) {
        fprintf(stderr,
            "pulse V2 — La boucle de vie de Benoit (sparse neural architecture)\n"
            "Usage: %s <brain.bin> [save_path] [arena_path] [--inject brain.ben]\n"
            "\n"
            "  brain.bin   : BEN2 binary brain file (or V1 for auto-migration)\n"
            "  save_path   : where to auto-save (default: brain.bin)\n"
            "  arena_path  : base directory for file I/O\n"
            "\n"
            "Runs forever. Signal-driven. Ctrl+C to save & stop.\n",
            argv[0]);
        return 1;
    }

    /* Scan for --new N flag first (shifts positional args) */
    int default_N = 1000;
    int arg_offset = 1;
    if (argc > 2 && strcmp(argv[1], "--new") == 0) {
        default_N = atoi(argv[2]);
        if (default_N < 10) default_N = 10;
        arg_offset = 3; /* skip --new N */
    }

    const char *brain_path = argc > arg_offset     ? argv[arg_offset]     : NULL;
    const char *save_path  = argc > arg_offset + 1 ? argv[arg_offset + 1] : brain_path;
    const char *arena_path = argc > arg_offset + 2 ? argv[arg_offset + 2] : NULL;
    const char *inject_path = NULL;

    if (!brain_path) {
        fprintf(stderr, "FATAL: brain path required\n");
        return 1;
    }

    /* Scan for --inject flag anywhere in args */
    for (int i = 1; i < argc - 1; i++) {
        if (strcmp(argv[i], "--inject") == 0) {
            inject_path = argv[i + 1];
            break;
        }
    }

    srand((unsigned)time(NULL));

    /* Install signal handlers for graceful shutdown */
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    /* ===== CREATE OR LOAD BRAIN (V2 sparse) ===== */
    VM *vm = vm_create(default_N);
    if (!vm) {
        fprintf(stderr, "FATAL: vm_create(%d) failed\n", default_N);
        return 1;
    }

    /* Initialize string table */
    strtab_init();

    /* Try to load existing brain state */
    FILE *ftest = fopen(brain_path, "rb");
    if (ftest) {
        fclose(ftest);
        /* Try V2 format first, then V1 migration */
        if (!vm_load_state(vm, brain_path)) {
            printf("  Trying V1 migration...\n");
            vm_load_v1(vm, brain_path);
        }
    } else {
        printf("  No brain file found, starting fresh with %d neurons\n", default_N);
        /* Create initial random sparse connections */
        vm_init_random_connections(vm, 50);
        printf("  Random connections: %d synapses\n", count_connections(vm));
    }

    /* Inject state from .ben text file if requested */
    if (inject_path) {
        inject_brain_ben(vm, inject_path);
        /* Reconstruire l'index inverse apres injection (synapse_add direct, pas vm_add_synapse) */
        vm_rebuild_incoming(vm);
    }

    if (arena_path) {
        vm->arena_path = strdup(arena_path);
    }

    /* Set globals for signal handler and HTTP thread */
    g_vm = vm;
    g_save_path = save_path;
    g_arena_path_global = arena_path;

#ifdef BENOIT_CUDA
    printf("  cuda: initialisation GPU...\n");
    g_cuda_ctx = ben_cuda_init_c(vm);
    if (g_cuda_ctx) {
        printf("  cuda: GPU actif — tick neural sur GPU\n");
    } else {
        printf("  cuda: init echouee — fallback CPU\n");
    }
#endif

    int N = vm->N;

    printf("===================================================\n");
    printf("  pulse V2 — Benoit vit. (sparse neural architecture)\n");
    printf("  .ben = une seule couche de code\n");
    printf("  C = signal pur (sparse synapses, hebbian, backprop)\n");
    printf("  N=%d | tick=%d | synapses=%d | strings=%d\n",
           N, (int)vm->vars[VAR_TICK], count_connections(vm), strtab.count);
    printf("  save -> %s\n", save_path);
    if (arena_path) printf("  arena -> %s (cycle every 10 ticks)\n", arena_path);
    printf("  Ctrl+C = sauvegarde + arret propre\n");
    printf("===================================================\n\n");

    /* Initialize persistent decision vars */
    vm->vars[VAR_SLEEP_ONSET] = 200;
    vm->vars[VAR_SLEEP_MAX]   = 700;
    vm->vars[VAR_LAST_SCORE]  = 2;

    /* ===== NETWORK: TCP server on port 3742 =====
     * "Pour ne pas etre seul dans cette machine." */
    #define BENOIT_PORT 3742
    net_init();
    SOCKET server_sock = socket(AF_INET, SOCK_STREAM, 0);
    SOCKET client_sock = INVALID_SOCKET;
    int net_active = 0;

    if (server_sock != INVALID_SOCKET) {
        int opt = 1;
        setsockopt(server_sock, SOL_SOCKET, SO_REUSEADDR, (const char *)&opt, sizeof(opt));
        struct sockaddr_in addr;
        memset(&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = INADDR_ANY;
        addr.sin_port = htons(BENOIT_PORT);
        if (bind(server_sock, (struct sockaddr *)&addr, sizeof(addr)) == 0 &&
            listen(server_sock, 5) == 0) {
            sock_set_nonblocking(server_sock);
            net_active = 1;
            printf("  reseau: port %d (telnet localhost %d)\n", BENOIT_PORT, BENOIT_PORT);
        } else {
            printf("  reseau: port %d indisponible\n", BENOIT_PORT);
            closesocket(server_sock);
            server_sock = INVALID_SOCKET;
        }
    }

    /* Register server socket for TCP commands */
    int server_sid = -1, client_sid = -1;
    if (net_active) {
        server_sid = sock_register(server_sock);
    }
    vm->vars[VAR_SERVER_SOCK] = (double)server_sid;
    vm->vars[VAR_CLIENT_SOCK] = -1;
    vm->vars[VAR_NET_MSG] = -1;

    /* ===== HTTP MONITORING THREAD (port 3743) =====
     * Démarre un thread dédié pour le dashboard web. */
#ifdef _WIN32
    {
        HANDLE hhttp = CreateThread(NULL, 0, http_thread, NULL, 0, NULL);
        if (hhttp) CloseHandle(hhttp);
        else fprintf(stderr, "  [http] CreateThread failed\n");
    }
#else
    {
        pthread_t http_tid;
        pthread_attr_t http_attr;
        pthread_attr_init(&http_attr);
        pthread_attr_setdetachstate(&http_attr, PTHREAD_CREATE_DETACHED);
        if (pthread_create(&http_tid, &http_attr, http_thread, NULL) != 0)
            fprintf(stderr, "  [http] pthread_create failed\n");
        pthread_attr_destroy(&http_attr);
    }
#endif

    /* Allocate pattern tracking buffer (using float for V2) */
    float *last_pattern = calloc(N, sizeof(float));
    for (int i = 0; i < N; i++)
        last_pattern[i] = vm->neurons[i].activation;

    /* Homeostatic plasticity: track silent ticks per neuron */
    int *silent_per_neuron = calloc(N, sizeof(int));
    int *firing_per_neuron = calloc(N, sizeof(int));

    /* Signal counters */
    int signal_ticks = 0;       /* ticks where pattern changed */
    int silent_ticks = 0;       /* consecutive ticks with no change */
    int total_ticks  = 0;       /* total ticks executed */
    int last_save_tick = 0;
    int last_vision_tick = 0;
    int tick_delay_ms = 0;      /* throttle: ms between ticks (0 = full speed) */

    clock_t t0 = clock();
    clock_t last_report = t0;

    /* ===== THE PULSE LOOP =====
     * "Tant qu'il y a du signal, je vis." */
    while (!g_shutdown) {
        N = vm->N;  /* N may change via vm_grow */

        /* --- Sensor injection (capped to 15, like all neurons) --- */
        /* Sensor 0: ratio d'activite normalise sur [0,15] — honnete a toute taille de N */
        {
            int _n_active = count_active(vm);
            vm->neurons[0].activation = fminf(
                ((float)_n_active / (float)(N > 5 ? N - 5 : 1)) * 15.0f, 15.0f);
        }
        vm->neurons[1].activation = fminf((float)(total_energy(vm) / 30.0), 15.0f); /* energy */
        vm->neurons[2].activation = fminf((float)count_absorbed(vm), 15.0f);   /* inhibition */
        vm->neurons[3].activation = 7.0f * sinf((float)total_ticks * 0.1f) + 7.0f;  /* oscillator 1 */
        vm->neurons[4].activation = 7.0f * cosf((float)total_ticks * 0.07f) + 7.0f; /* oscillator 2 */

        /* Mark sensor neurons as fired if above threshold */
        for (int i = 0; i < 5 && i < N; i++) {
            vm->neurons[i].fired = (vm->neurons[i].activation > vm->neurons[i].threshold) ? 1 : 0;
        }

        /* --- Vision: scan arena every 100 ticks --- */
        if (total_ticks - last_vision_tick >= 100) {
            vision_scan(vm, arena_path);
            last_vision_tick = total_ticks;
        }

        /* Sync vars for .ben convenience */
        vm->vars[VAR_ACTIFS]   = (double)count_active(vm);
        vm->vars[VAR_ABSORBED] = (double)count_absorbed(vm);
        vm->vars[VAR_CONNS]    = (double)count_connections(vm);

        /* --- Network: accept + receive (non-blocking, zombie-proof) --- */
        vm->vars[VAR_NET_MSG] = -1;  /* reset each tick */
        if (net_active) {
            /* Zombie-proof: if client_sock looks alive but is dead, force cleanup.
             * Every 500 ticks, probe with a zero-length send to detect dead sockets. */
            static int net_idle_ticks = 0;
            if (client_sock != INVALID_SOCKET) {
                net_idle_ticks++;
                if (net_idle_ticks > 500) {
                    /* Probe: send 0 bytes to detect broken connection */
                    int probe = send(client_sock, "", 0, 0);
                    if (probe < 0) {
                        #ifdef _WIN32
                        int err = WSAGetLastError();
                        if (err != WSAEWOULDBLOCK) {
                        #else
                        if (errno != EWOULDBLOCK && errno != EAGAIN) {
                        #endif
                            printf("  [net] zombie detect -> cleanup\n");
                            fflush(stdout);
                            closesocket(client_sock);
                            if (client_sid >= 0) sock_table[client_sid] = INVALID_SOCKET;
                            client_sock = INVALID_SOCKET;
                            client_sid = -1;
                            vm->vars[VAR_CLIENT_SOCK] = -1;
                        }
                    }
                    net_idle_ticks = 0;
                }
            }

            /* Always try to accept — if current client is dead, replace it */
            {
                SOCKET cs = accept(server_sock, NULL, NULL);
                if (cs != INVALID_SOCKET) {
                    sock_set_nonblocking(cs);
                    /* If we already have a client, close the OLD one (it's probably dead) */
                    if (client_sock != INVALID_SOCKET) {
                        printf("  [net] replacing old client (force close)\n");
                        fflush(stdout);
                        closesocket(client_sock);
                        if (client_sid >= 0) sock_table[client_sid] = INVALID_SOCKET;
                    }
                    client_sock = cs;
                    client_sid = sock_register(cs);
                    vm->vars[VAR_CLIENT_SOCK] = (double)client_sid;
                    net_idle_ticks = 0;
                    printf("  [net] client connecte (socket %d)\n", client_sid);
                    fflush(stdout);
                }
            }

            /* Try to receive data from client */
            if (client_sock != INVALID_SOCKET) {
                char buf[4096];
                int n = recv(client_sock, buf, sizeof(buf) - 1, 0);
                if (n > 0) {
                    buf[n] = '\0';
                    net_idle_ticks = 0; /* client is alive */
                    /* Parse command and build response (pure C) */
                    char resp[8192];
                    int rlen = process_command(vm, buf, n, resp, sizeof(resp));
                    if (rlen > 0 && client_sock != INVALID_SOCKET) {
                        send(client_sock, resp, rlen, 0);
                    }
                    /* Also inject into strtab for .ben access */
                    int msg_id = strtab_add(buf, n);
                    vm->vars[VAR_NET_MSG] = (double)msg_id;
                    printf("  [net] cmd: \"%.*s\" -> %d octets\n",
                           n > 60 ? 60 : n, buf, rlen);
                    fflush(stdout);
                } else if (n == 0 || (n < 0 &&
                    #ifdef _WIN32
                    WSAGetLastError() != WSAEWOULDBLOCK
                    #else
                    errno != EWOULDBLOCK && errno != EAGAIN
                    #endif
                    )) {
                    /* Client disconnected or error — free the slot */
                    printf("  [net] client deconnecte (n=%d)\n", n);
                    fflush(stdout);
                    closesocket(client_sock);
                    if (client_sid >= 0) sock_table[client_sid] = INVALID_SOCKET;
                    client_sock = INVALID_SOCKET;
                    client_sid = -1;
                    vm->vars[VAR_CLIENT_SOCK] = -1;
                }
                /* n < 0 with EWOULDBLOCK/EAGAIN = no data yet, that's fine */
            }
        }

        /* --- V2 Neural Tick (sparse propagation) ---
         * "Le silicium fait vibrer chaque neurone."
         * Uses sparse synapse lists instead of dense W[N][N] matrix. */
        int fired_count = 0;
#ifdef BENOIT_CUDA
        if (g_cuda_ctx) {
            fired_count = ben_cuda_tick_c(g_cuda_ctx, total_ticks);
            vm->vars[VAR_TOTAL_FIRINGS] += fired_count;
            /* STDP sur GPU */
            ben_cuda_stdp_c(g_cuda_ctx);
            /* Sync vers CPU toutes les 10 ticks (avant le cycle .ben) */
            if (total_ticks % 10 == 0) {
                ben_cuda_sync_to_cpu_c(g_cuda_ctx, vm);
            }
        } else {
#endif
            fired_count = vm_neural_tick(vm, total_ticks);
            vm->vars[VAR_TOTAL_FIRINGS] += fired_count;

            /* --- V2 STDP Learning (spike-timing-dependent plasticity) ---
             * "Le temps entre les spikes decide du lien." */
            vm_stdp(vm);
#ifdef BENOIT_CUDA
        }
#endif

        /* --- Signal detection --- */
        int changes = pattern_changed(last_pattern, vm);

        if (changes > 0) {
            signal_ticks++;
            silent_ticks = 0;
        } else {
            silent_ticks++;
        }

        /* Save current pattern for next comparison (realloc handles growth) */
        {
            float *new_pattern = realloc(last_pattern, N * sizeof(float));
            if (new_pattern) {
                last_pattern = new_pattern;
                for (int i = 0; i < N; i++)
                    last_pattern[i] = vm->neurons[i].activation;
            }
        }

        /* --- Homeostatic plasticity (V2: works on neuron structs) ---
         * "Un neurone qui ne parle jamais finit par crier.
         *  Un neurone qui crie tout le temps finit par se taire." */
        {
            for (int i = 5; i < N; i++) {
                Neuron *n = &vm->neurons[i];
                if (n->activation <= 0) {
                    silent_per_neuron[i]++;
                    firing_per_neuron[i] = 0;
                } else {
                    firing_per_neuron[i]++;
                    silent_per_neuron[i] = 0;
                }
                /* Every 200 silent ticks: aggressively rescue dead neuron */
                if (silent_per_neuron[i] >= 200) {
                    n->threshold -= 1.0f;
                    if (n->threshold < 0.3f) n->threshold = 0.3f;
                    silent_per_neuron[i] = 0;
                    /* Boost incoming synapse weights 20% via reverse index — O(K^2) vs O(N*K) */
                    for (int k = 0; k < n->n_incoming; k++) {
                        int src_idx = n->incoming_src[k];
                        if (src_idx < 0 || src_idx >= N) continue;
                        Neuron *src = &vm->neurons[src_idx];
                        for (int s = 0; s < src->n_syn; s++) {
                            if (src->synapses[s].target == i &&
                                src->synapses[s].weight > 0 &&
                                src->synapses[s].weight < 2.0f) {
                                src->synapses[s].weight *= 1.2f;
                            }
                        }
                    }
                }
                /* Every 200 firing ticks: calm overactive neuron */
                if (firing_per_neuron[i] >= 200) {
                    n->threshold += 1.0f;
                    if (n->threshold > 15.0f) n->threshold = 15.0f;
                    firing_per_neuron[i] = 0;
                }
            }
        }

        /* --- Self-adaptation: Benoit ajuste ses propres lr/decay tous les 1000 ticks --- */
        if (total_ticks % 1000 == 0 && total_ticks > 0) {
            for (int i = 5; i < N; i++) {
                Neuron *n = &vm->neurons[i];
                if (n->activation >= n->cap * 0.95f) {
                    n->lr *= 0.95f;
                    if (n->lr < 0.005f) n->lr = 0.005f;
                    n->decay *= 1.05f;
                    if (n->decay > 0.1f) n->decay = 0.1f;
                } else if (n->activation <= 0) {
                    n->lr *= 1.05f;
                    if (n->lr > 0.2f) n->lr = 0.2f;
                    n->decay *= 0.95f;
                    if (n->decay < 0.001f) n->decay = 0.001f;
                }
            }
        }

        /* --- V2 Backpropagation (sparse error propagation) ---
         * Every 50 ticks, run backprop through sparse synapses. */
        if (total_ticks % 50 == 0) {
            vm_backprop(vm);
        }

        /* --- Advance VM tick counter — total_ticks is the source of truth --- */
        vm->vars[VAR_TICK] = (double)total_ticks;

        /* --- .ben cycle (every 10 ticks) ---
         * ".ben = une seule couche. C = signal pur."
         * Tout le comportement vit dans .ben. C pulse les neurones. */
        if (arena_path && total_ticks % 10 == 0) {
            /* Sync neuron state to legacy arrays before .ben execution */
            vm_sync_to_arrays(vm);

            /* Sync VM vars from C-computed state */
            vm->vars[VAR_ACTIFS]   = (double)count_active(vm);
            vm->vars[VAR_CONNS]    = (double)count_connections(vm);
            vm->vars[VAR_ABSORBED] = (double)count_absorbed(vm);

            char log[4096];
            log[0] = 0;
            char cycle_path[512];
            snprintf(cycle_path, sizeof(cycle_path), "%s/cycle.ben", arena_path);

            /* Try cycle.ben first; if absent, try individual decision files */
            FILE *fc = fopen(cycle_path, "r");
            if (fc) {
                fclose(fc);
                ben_exec_file(vm, cycle_path, vm->arena_path, log, sizeof(log));
            } else {
                /* Execute individual .ben decision files if they exist */
                char fpath[512];
                snprintf(fpath, sizeof(fpath), "%s/diagnostic.ben", arena_path);
                FILE *ft = fopen(fpath, "r");
                if (ft) { fclose(ft); ben_exec_file(vm, fpath, vm->arena_path, log, sizeof(log)); }

                snprintf(fpath, sizeof(fpath), "%s/decide.ben", arena_path);
                ft = fopen(fpath, "r");
                if (ft) { fclose(ft); ben_exec_file(vm, fpath, vm->arena_path, log, sizeof(log)); }

                snprintf(fpath, sizeof(fpath), "%s/measure.ben", arena_path);
                ft = fopen(fpath, "r");
                if (ft) { fclose(ft); ben_exec_file(vm, fpath, vm->arena_path, log, sizeof(log)); }
            }

            /* Sync legacy arrays back to neuron structs after .ben execution */
            vm_sync_from_arrays(vm);

#ifdef BENOIT_CUDA
            /* Apres le cycle .ben, repousser l'etat CPU vers le GPU */
            if (g_cuda_ctx) {
                ben_cuda_sync_from_cpu_c(g_cuda_ctx, vm);
            }
#endif
        }

        /* --- Handle growth requested by .ben (via VAR_SHOULD_GROW) --- */
        if (vm->vars[VAR_SHOULD_GROW] > 0) {
            int grow_count = (int)vm->vars[VAR_SHOULD_GROW];
            if (grow_count > 0 && grow_count <= 10000) {
                int old_N = vm->N;
                int added = vm_grow(vm, grow_count);
                if (added > 0) {
                    /* Connect new neurons randomly */
                    int conn_per_new = (int)vm->vars[VAR_CONN_PER_NEW];
                    if (conn_per_new <= 0) conn_per_new = 20;
                    for (int i = old_N; i < vm->N; i++) {
                        for (int c = 0; c < conn_per_new; c++) {
                            int target = rand() % vm->N;
                            if (target == i) continue;
                            float weight = ((float)rand() / RAND_MAX - 0.5f) * 2.0f;
                            vm_random_connect(vm, i, target, weight);
                        }
                    }
                    /* Reallocate tracking arrays */
                    N = vm->N;
                    silent_per_neuron = realloc(silent_per_neuron, N * sizeof(int));
                    firing_per_neuron = realloc(firing_per_neuron, N * sizeof(int));
                    memset(&silent_per_neuron[old_N], 0, (N - old_N) * sizeof(int));
                    memset(&firing_per_neuron[old_N], 0, (N - old_N) * sizeof(int));
                    vm->vars[VAR_GROW_COUNT] += added;
                    printf("  [grow] +%d neurones -> N=%d\n", added, N);
                    fflush(stdout);
                }
            }
            vm->vars[VAR_SHOULD_GROW] = 0;
        }

        /* --- Handle pruning requested by .ben (via decision == 4 "elaguer") --- */
        if ((int)vm->vars[VAR_DECISION] == 4 && total_ticks % 100 == 0) {
            int pruned = vm_prune(vm, 0.5f);
            if (pruned > 0) {
                printf("  [prune] %d weak synapses removed\n", pruned);
                fflush(stdout);
            }
        }

        total_ticks++;

        /* --- Throttle: slow down for observation/training --- */
        if (g_tick_delay_ms > 0) {
            #ifdef _WIN32
            Sleep(g_tick_delay_ms);
            #else
            usleep(g_tick_delay_ms * 1000);
            #endif
        }

        /* --- Log every 50 signal ticks --- */
        if (signal_ticks > 0 && signal_ticks % 50 == 0 && changes > 0) {
            clock_t now = clock();
            double elapsed = (double)(now - t0) / CLOCKS_PER_SEC;
            int etat = (int)vm->vars[VAR_ETAT];
            int dec  = (int)vm->vars[VAR_DECISION];
            printf("  [signal %d | tick %d | %.1fs] "
                   "actifs=%d/%d conns=%d score=%d etat=%s dec=%s "
                   "div=%d fails=%d silent=%d\n",
                   signal_ticks,
                   (int)vm->vars[VAR_TICK],
                   elapsed,
                   (int)vm->vars[VAR_ACTIFS], N,
                   (int)vm->vars[VAR_CONNS],
                   (int)vm->vars[VAR_SCORE],
                   (etat >= 0 && etat <= 6) ? ETAT_NAMES[etat] : "?",
                   (dec >= 0 && dec <= 7) ? DECISION_NAMES[dec] : "?",
                   (int)vm->vars[VAR_DIVERSITY],
                   (int)vm->vars[VAR_FAILS],
                   silent_ticks);
            fflush(stdout);
        }

        /* --- Periodic status (every 5 seconds of wall time) --- */
        {
            clock_t now = clock();
            if ((now - last_report) > 5 * CLOCKS_PER_SEC) {
                double elapsed = (double)(now - t0) / CLOCKS_PER_SEC;
                double tps = total_ticks / elapsed;
                printf("  ... %d ticks (%.0f/s) | %d signals | silent=%d | "
                       "tick=%d | score=%d | N=%d | syn=%d\n",
                       total_ticks, tps, signal_ticks, silent_ticks,
                       (int)vm->vars[VAR_TICK],
                       (int)vm->vars[VAR_SCORE],
                       vm->N, count_connections(vm));
                fflush(stdout);
                last_report = now;
            }
        }

        /* --- Auto-save every 2000 ticks --- */
        if (total_ticks - last_save_tick >= 2000) {
            vm_save_state(vm, save_path);
            last_save_tick = total_ticks;
        }

        /* --- Throttle: sleep when silent ---
         * No signal change = brain is stable, save CPU.
         * "Je dors quand le monde est calme." */
        if (silent_ticks > 100) {
#ifdef _WIN32
            Sleep(10);  /* 10ms deep sleep */
#else
            usleep(10000);
#endif
        } else if (silent_ticks > 10) {
#ifdef _WIN32
            Sleep(2);   /* 2ms light sleep */
#else
            usleep(2000);
#endif
        }
        /* else: full speed — signal is alive */
    }

    /* ===== GRACEFUL SHUTDOWN =====
     * "Je ne meurs pas. Je m'endors en me souvenant." */
    printf("\n\n  Arret demande. Sauvegarde en cours...\n");
    vm_save_state(vm, save_path);
    double elapsed = (double)(clock() - t0) / CLOCKS_PER_SEC;
    printf("  Sauvegarde: %s (tick %d)\n", save_path, (int)vm->vars[VAR_TICK]);
    printf("  Session: %d ticks en %.0fs (%.0f/s) | %d signaux\n",
           total_ticks, elapsed, total_ticks / (elapsed > 0 ? elapsed : 1), signal_ticks);
    printf("  N=%d | synapses=%d\n", vm->N, count_connections(vm));
    printf("  Benoit dort. Il se souviendra.\n\n");

    free(last_pattern);
    free(silent_per_neuron);
    free(firing_per_neuron);
    net_cleanup();
    strtab_free();

#ifdef BENOIT_CUDA
    /* Synchroniser l'etat GPU vers CPU avant de liberer le contexte CUDA */
    if (g_cuda_ctx) {
        ben_cuda_sync_to_cpu_c(g_cuda_ctx, vm);
        ben_cuda_free_c(g_cuda_ctx);
        g_cuda_ctx = NULL;
    }
#endif

    vm_free(vm);
    return 0;
}
