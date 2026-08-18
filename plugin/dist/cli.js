#!/usr/bin/env node
import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/util/args.ts
function parseArgs(raw, booleanFlags = []) {
  const bools = /* @__PURE__ */ new Set([...KNOWN_BOOLEAN_FLAGS, ...booleanFlags]);
  const argv = { positional: [], options: {}, multi: {}, flags: {}, passthrough: [] };
  const pushMulti = (key, value) => {
    (argv.multi[key] ??= []).push(value);
  };
  let i = 0;
  for (; i < raw.length; i++) {
    const token = raw[i];
    if (token === "--") {
      argv.passthrough = raw.slice(i + 1);
      break;
    }
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        const key = body.slice(0, eq);
        const value = body.slice(eq + 1);
        argv.options[key] = value;
        pushMulti(key, value);
        continue;
      }
      if (body.startsWith("no-")) {
        argv.flags[body.slice(3)] = false;
        continue;
      }
      const next = raw[i + 1];
      if (bools.has(body) || next === void 0 || next.startsWith("-")) {
        argv.flags[body] = true;
      } else {
        argv.options[body] = next;
        pushMulti(body, next);
        i++;
      }
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      const body = token.slice(1);
      const next = raw[i + 1];
      if (bools.has(body) || next === void 0 || next.startsWith("-")) {
        argv.flags[body] = true;
      } else {
        argv.options[body] = next;
        pushMulti(body, next);
        i++;
      }
      continue;
    }
    argv.positional.push(token);
  }
  return argv;
}
function flag(argv, ...names) {
  for (const n of names) {
    if (argv.flags[n] !== void 0) return argv.flags[n];
  }
  return false;
}
function enabled(argv, ...names) {
  for (const n of names) {
    if (argv.flags[n] !== void 0) return argv.flags[n];
  }
  return true;
}
function option(argv, ...names) {
  for (const n of names) {
    const v = argv.options[n];
    if (v !== void 0) return v;
  }
  return void 0;
}
function multiOption(argv, ...names) {
  const out = [];
  for (const n of names) out.push(...argv.multi[n] ?? []);
  return out;
}
var KNOWN_BOOLEAN_FLAGS;
var init_args = __esm({
  "src/util/args.ts"() {
    "use strict";
    KNOWN_BOOLEAN_FLAGS = /* @__PURE__ */ new Set([
      "help",
      "h",
      "version",
      "v",
      "yes",
      "y",
      "json",
      "quiet",
      "q",
      "strict",
      "force",
      // Không khai ở đây thì `ganas commit --dry-run T-005` nuốt `T-005` làm GIÁ TRỊ
      // của `--dry-run`, và lệnh im lặng chạy trên task khác.
      "dry-run",
      "all-ganas",
      "check"
    ]);
  }
});

// src/util/errors.ts
var GanasError, NotInitializedError;
var init_errors = __esm({
  "src/util/errors.ts"() {
    "use strict";
    GanasError = class extends Error {
      exitCode;
      constructor(message, exitCode = 1) {
        super(message);
        this.name = "GanasError";
        this.exitCode = exitCode;
      }
    };
    NotInitializedError = class extends GanasError {
      constructor(from) {
        super(
          `kh\xF4ng t\xECm th\u1EA5y .ganas/ t\u1EEB "${from}" tr\u1EDF l\xEAn.
  Kh\u1EDFi t\u1EA1o:   ganas init
  D\u1EF1 \xE1n \u0111\xE3 c\xF3 code: ganas init r\u1ED3i \`ganas scope new\` \u2014 tr\u1ECF paths v\xE0o code
              hi\u1EC7n c\xF3, ganas s\u1EBD d\u1EF1ng kh\u1ED1i t\u01B0\u01A1ng \u1EE9ng.`,
          2
        );
        this.name = "NotInitializedError";
      }
    };
  }
});

// src/graph/paths.ts
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
function findGanasRoot(from = process.cwd()) {
  let dir = resolve(from);
  for (; ; ) {
    if (existsSync(join(dir, GANAS_DIR, CONFIG_FILE))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function requireGanasRoot(from = process.cwd()) {
  const root = findGanasRoot(from);
  if (!root) throw new NotInitializedError(resolve(from));
  return root;
}
function ganasPath(root, ...parts) {
  return join(root, GANAS_DIR, ...parts);
}
var GANAS_DIR, DIRS, CONFIG_FILE, STATE_FILE, LOCAL_ONLY;
var init_paths = __esm({
  "src/graph/paths.ts"() {
    "use strict";
    init_errors();
    GANAS_DIR = ".ganas";
    DIRS = {
      goals: "goals",
      designs: "designs",
      tasks: "tasks",
      /** Phạm vi công việc — đơn vị bàn giao, cũng là ranh giới của tri thức. */
      scopes: "scopes",
      /** Sơ đồ khối — cũng chính là bản đồ hệ thống (thay cho `zones` cũ). */
      modules: "modules",
      facts: "facts",
      claims: "claims",
      decisions: "decisions",
      /** Việc đã quyết CHƯA làm — xem docstring đầu `src/model/icebox.ts`. */
      icebox: "icebox",
      domains: "domains",
      legacy: "legacy",
      legacyImported: join("legacy", "imported"),
      map: "map",
      mapSurveys: join("map", "surveys"),
      proposals: "proposals",
      runs: "runs",
      /** Lock file giữ task cho một phiên — xem `graph/claim.ts`. */
      locks: ".locks"
    };
    CONFIG_FILE = "config.yaml";
    STATE_FILE = "state.json";
    LOCAL_ONLY = [`${DIRS.runs}/`, `${DIRS.locks}/`, STATE_FILE];
  }
});

// src/util/exec.ts
var exec_exports = {};
__export(exec_exports, {
  judge: () => judge,
  runShell: () => runShell
});
import { execFile } from "node:child_process";
function runShell(command, opts = {}) {
  const started = Date.now();
  return new Promise((resolve4) => {
    const child = execFile(
      command,
      {
        shell: true,
        cwd: opts.cwd ?? process.cwd(),
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        env: { ...process.env, ...opts.env, GANAS_PROBE: "1" },
        // Probe không được hỏi gì — nếu nó chờ input thì phải fail, không treo.
        windowsHide: true
      },
      (error, stdout, stderr) => {
        const rawCode = error ? error.code : 0;
        const timedOut = rawCode === "ETIMEDOUT" || error?.killed === true;
        resolve4({
          code: typeof rawCode === "number" ? rawCode : error ? 1 : 0,
          stdout: String(stdout),
          stderr: String(stderr),
          timedOut,
          durationMs: Date.now() - started
        });
      }
    );
    child.stdin?.end();
  });
}
function judge(result, expect) {
  if (result.timedOut) {
    return { pass: false, reason: `l\u1EC7nh qu\xE1 h\u1EA1n sau ${result.durationMs}ms` };
  }
  if (expect === "exit_zero") {
    if (result.code === 0) return { pass: true };
    return {
      pass: false,
      reason: `tho\xE1t v\u1EDBi m\xE3 ${result.code}${result.stderr.trim() ? ` \u2014 ${firstLines(result.stderr)}` : ""}`
    };
  }
  if (expect.exit_code !== void 0 && result.code !== expect.exit_code) {
    return { pass: false, reason: `mong \u0111\u1EE3i m\xE3 tho\xE1t ${expect.exit_code}, nh\u1EADn ${result.code}` };
  }
  if (expect.stdout_contains !== void 0 && !result.stdout.includes(expect.stdout_contains)) {
    return { pass: false, reason: `stdout kh\xF4ng ch\u1EE9a "${expect.stdout_contains}"` };
  }
  if (expect.stdout_matches !== void 0) {
    let re;
    try {
      re = new RegExp(expect.stdout_matches);
    } catch {
      return {
        pass: false,
        reason: `stdout_matches kh\xF4ng ph\u1EA3i regex h\u1EE3p l\u1EC7: ${expect.stdout_matches}`
      };
    }
    if (!re.test(result.stdout)) {
      return { pass: false, reason: `stdout kh\xF4ng kh\u1EDBp /${expect.stdout_matches}/` };
    }
  }
  if (expect.stderr_contains !== void 0 && !result.stderr.includes(expect.stderr_contains)) {
    return { pass: false, reason: `stderr kh\xF4ng ch\u1EE9a "${expect.stderr_contains}"` };
  }
  if (expect.exit_code === void 0 && result.code !== 0) {
    return { pass: false, reason: `tho\xE1t v\u1EDBi m\xE3 ${result.code}` };
  }
  return { pass: true };
}
function firstLines(text, n = 3) {
  return text.trim().split("\n").slice(0, n).join(" / ");
}
var DEFAULT_TIMEOUT_MS, MAX_BUFFER;
var init_exec = __esm({
  "src/util/exec.ts"() {
    "use strict";
    DEFAULT_TIMEOUT_MS = 12e4;
    MAX_BUFFER = 4 * 1024 * 1024;
  }
});

// src/gate.ts
import { existsSync as existsSync2 } from "node:fs";
import { readFile } from "node:fs/promises";
import { join as join2 } from "node:path";
function criterionKey(c) {
  switch (c.kind) {
    case "command":
      return `command:${c.run}`;
    case "artifact":
      return `artifact:${c.path}`;
    case "handoff":
      return `handoff:${c.required}`;
    case "manual":
      return `manual:${c.check}`;
    case "verification":
      return `verification:${c.target}`;
  }
}
function isAutoCriterion(c) {
  return c.kind === "command" || c.kind === "artifact" || c.kind === "verification";
}
function alreadyGreen(gate, baseline) {
  if (!baseline) return [];
  return gate.results.filter(
    (r) => r.status === "pass" && baseline[criterionKey(r.criterion)] === true
  );
}
function labelOf(c) {
  switch (c.kind) {
    case "command":
      return `l\u1EC7nh \`${c.run}\``;
    case "artifact":
      return `file \`${c.path}\`` + (c.must_contain ? ` ch\u1EE9a \`${c.must_contain}\`` : "");
    case "handoff":
      return "handoff record c\u1EE7a phi\xEAn";
    case "manual":
      return c.check;
    case "verification":
      return `b\u1EB1ng ch\u1EE9ng \`${c.target}\``;
  }
}
async function checkCriterion(criterion, ctx) {
  const label = labelOf(criterion);
  switch (criterion.kind) {
    case "command": {
      const result = await runShell(criterion.run, { cwd: ctx.root });
      const verdict = judge(result, criterion.expect);
      return verdict.pass ? { criterion, label, status: "pass" } : { criterion, label, status: "fail", reason: verdict.reason };
    }
    case "artifact": {
      const file = join2(ctx.root, criterion.path);
      if (!existsSync2(file)) {
        return { criterion, label, status: "fail", reason: `file ch\u01B0a t\u1ED3n t\u1EA1i` };
      }
      if (criterion.must_contain) {
        const content = await readFile(file, "utf8").catch(() => "");
        if (!content.includes(criterion.must_contain)) {
          return {
            criterion,
            label,
            status: "fail",
            reason: `file t\u1ED3n t\u1EA1i nh\u01B0ng ch\u01B0a ch\u1EE9a "${criterion.must_contain}"`
          };
        }
      }
      return { criterion, label, status: "pass" };
    }
    case "handoff": {
      if (!criterion.required) return { criterion, label, status: "pass" };
      if (!ctx.sessionId) {
        return {
          criterion,
          label,
          status: "fail",
          reason: "kh\xF4ng bi\u1EBFt session id n\xEAn kh\xF4ng x\xE1c \u0111\u1ECBnh \u0111\u01B0\u1EE3c handoff"
        };
      }
      const file = ganasPath(ctx.root, DIRS.runs, `${ctx.sessionId}.md`);
      return existsSync2(file) ? { criterion, label, status: "pass" } : {
        criterion,
        label,
        status: "fail",
        reason: `ch\u01B0a c\xF3 ${DIRS.runs}/${ctx.sessionId}.md \u2014 ch\u1EA1y \`ganas handoff\``
      };
    }
    case "manual":
      return { criterion, label, status: "pending_human" };
    case "verification": {
      const state = ctx.freshness.get(criterion.target);
      if (!state) {
        return {
          criterion,
          label,
          status: "fail",
          reason: `kh\xF4ng t\xECm th\u1EA5y target "${criterion.target}" trong s\u1ED5 c\xE1i/graph`
        };
      }
      return state.freshness === "fresh" ? { criterion, label, status: "pass" } : { criterion, label, status: "fail", reason: state.reason };
    }
  }
}
async function evaluateGate(graph, task, freshness, sessionId) {
  const results = await Promise.all(
    task.exit_contract.map((c) => checkCriterion(c, { root: graph.root, sessionId, freshness }))
  );
  const unmet = results.filter((r) => r.status === "fail");
  const pendingHuman = results.filter((r) => r.status === "pending_human");
  return { task: task.id, ok: unmet.length === 0, results, unmet, pendingHuman };
}
function formatGate(result) {
  const lines = [];
  for (const r of result.results) {
    const mark = r.status === "pass" ? "\u2713" : r.status === "fail" ? "\u2717" : "\u2026";
    lines.push(`  ${mark} ${r.label}${r.reason ? `
      ${r.reason}` : ""}`);
  }
  return lines.join("\n");
}
var init_gate = __esm({
  "src/gate.ts"() {
    "use strict";
    init_paths();
    init_exec();
  }
});

// src/graph/select.ts
function openBlockers(graph, task) {
  return task.blocked_by.filter((id) => {
    const blocker = graph.tasks.get(id);
    return !blocker || blocker.value.status !== "done";
  });
}
function candidates(graph) {
  return [...graph.tasks.values()].filter((t) => t.value.status !== "done").map((task) => ({ task, blockers: openBlockers(graph, task.value) }));
}
function rankedCandidates(graph, opts = {}) {
  const open2 = candidates(graph).filter((c) => c.blockers.length === 0);
  if (open2.length === 0) return [];
  const rank = (c) => {
    const t = c.task.value;
    const scope = graph.scopes.get(t.scope)?.value;
    let score = 0;
    if (t.status === "in_progress") score -= 1e3;
    if (scope?.status === "active") score -= 100;
    if (scope?.status === "delivered") score += 100;
    if (opts.preferScope !== void 0 && t.scope === opts.preferScope) score -= 50;
    if (t.estimated_context === "small") score -= 1;
    return score;
  };
  return open2.sort((a, b) => rank(a) - rank(b) || a.task.value.id.localeCompare(b.task.value.id));
}
function selectNextTask(graph, opts = {}) {
  return rankedCandidates(graph, opts)[0] ?? null;
}
function staticPrefix(glob) {
  const cut = glob.search(/[*?[{]/);
  const head = cut === -1 ? glob : glob.slice(0, cut);
  const slash = head.lastIndexOf("/");
  return slash === -1 ? "" : head.slice(0, slash + 1);
}
function pathsOverlap(a, b) {
  for (const x of a.map(staticPrefix)) {
    for (const y of b.map(staticPrefix)) {
      if (x.startsWith(y) || y.startsWith(x)) return true;
    }
  }
  return false;
}
function taskPaths(graph, task) {
  return task.touches.flatMap((id) => graph.modules.get(id)?.value.paths ?? []);
}
function parallelCandidates(graph, task) {
  const mine = new Set(task.touches);
  const minePaths = taskPaths(graph, task);
  if (task.touches.length === 0) return [];
  return candidates(graph).filter((c) => {
    const t = c.task.value;
    if (t.id === task.id || c.blockers.length > 0) return false;
    if (t.blocked_by.includes(task.id) || task.blocked_by.includes(t.id)) return false;
    if (t.touches.length === 0) return false;
    if (t.touches.some((m) => mine.has(m))) return false;
    return !pathsOverlap(taskPaths(graph, t), minePaths);
  }).map((c) => c.task).sort((a, b) => a.value.id.localeCompare(b.value.id));
}
function blockedTasks(graph) {
  return candidates(graph).filter((c) => c.blockers.length > 0).sort((a, b) => a.task.value.id.localeCompare(b.task.value.id));
}
var init_select = __esm({
  "src/graph/select.ts"() {
    "use strict";
  }
});

// node_modules/zod/v3/helpers/util.js
var util, objectUtil, ZodParsedType, getParsedType;
var init_util = __esm({
  "node_modules/zod/v3/helpers/util.js"() {
    (function(util2) {
      util2.assertEqual = (_) => {
      };
      function assertIs(_arg) {
      }
      util2.assertIs = assertIs;
      function assertNever(_x) {
        throw new Error();
      }
      util2.assertNever = assertNever;
      util2.arrayToEnum = (items) => {
        const obj = {};
        for (const item of items) {
          obj[item] = item;
        }
        return obj;
      };
      util2.getValidEnumValues = (obj) => {
        const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
        const filtered = {};
        for (const k of validKeys) {
          filtered[k] = obj[k];
        }
        return util2.objectValues(filtered);
      };
      util2.objectValues = (obj) => {
        return util2.objectKeys(obj).map(function(e) {
          return obj[e];
        });
      };
      util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
        const keys = [];
        for (const key in object) {
          if (Object.prototype.hasOwnProperty.call(object, key)) {
            keys.push(key);
          }
        }
        return keys;
      };
      util2.find = (arr, checker) => {
        for (const item of arr) {
          if (checker(item))
            return item;
        }
        return void 0;
      };
      util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
      function joinValues(array, separator = " | ") {
        return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
      }
      util2.joinValues = joinValues;
      util2.jsonStringifyReplacer = (_, value) => {
        if (typeof value === "bigint") {
          return value.toString();
        }
        return value;
      };
    })(util || (util = {}));
    (function(objectUtil2) {
      objectUtil2.mergeShapes = (first, second) => {
        return {
          ...first,
          ...second
          // second overwrites first
        };
      };
    })(objectUtil || (objectUtil = {}));
    ZodParsedType = util.arrayToEnum([
      "string",
      "nan",
      "number",
      "integer",
      "float",
      "boolean",
      "date",
      "bigint",
      "symbol",
      "function",
      "undefined",
      "null",
      "array",
      "object",
      "unknown",
      "promise",
      "void",
      "never",
      "map",
      "set"
    ]);
    getParsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "undefined":
          return ZodParsedType.undefined;
        case "string":
          return ZodParsedType.string;
        case "number":
          return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
        case "boolean":
          return ZodParsedType.boolean;
        case "function":
          return ZodParsedType.function;
        case "bigint":
          return ZodParsedType.bigint;
        case "symbol":
          return ZodParsedType.symbol;
        case "object":
          if (Array.isArray(data)) {
            return ZodParsedType.array;
          }
          if (data === null) {
            return ZodParsedType.null;
          }
          if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
            return ZodParsedType.promise;
          }
          if (typeof Map !== "undefined" && data instanceof Map) {
            return ZodParsedType.map;
          }
          if (typeof Set !== "undefined" && data instanceof Set) {
            return ZodParsedType.set;
          }
          if (typeof Date !== "undefined" && data instanceof Date) {
            return ZodParsedType.date;
          }
          return ZodParsedType.object;
        default:
          return ZodParsedType.unknown;
      }
    };
  }
});

// node_modules/zod/v3/ZodError.js
var ZodIssueCode, quotelessJson, ZodError;
var init_ZodError = __esm({
  "node_modules/zod/v3/ZodError.js"() {
    init_util();
    ZodIssueCode = util.arrayToEnum([
      "invalid_type",
      "invalid_literal",
      "custom",
      "invalid_union",
      "invalid_union_discriminator",
      "invalid_enum_value",
      "unrecognized_keys",
      "invalid_arguments",
      "invalid_return_type",
      "invalid_date",
      "invalid_string",
      "too_small",
      "too_big",
      "invalid_intersection_types",
      "not_multiple_of",
      "not_finite"
    ]);
    quotelessJson = (obj) => {
      const json = JSON.stringify(obj, null, 2);
      return json.replace(/"([^"]+)":/g, "$1:");
    };
    ZodError = class _ZodError extends Error {
      get errors() {
        return this.issues;
      }
      constructor(issues) {
        super();
        this.issues = [];
        this.addIssue = (sub) => {
          this.issues = [...this.issues, sub];
        };
        this.addIssues = (subs = []) => {
          this.issues = [...this.issues, ...subs];
        };
        const actualProto = new.target.prototype;
        if (Object.setPrototypeOf) {
          Object.setPrototypeOf(this, actualProto);
        } else {
          this.__proto__ = actualProto;
        }
        this.name = "ZodError";
        this.issues = issues;
      }
      format(_mapper) {
        const mapper = _mapper || function(issue) {
          return issue.message;
        };
        const fieldErrors = { _errors: [] };
        const processError = (error) => {
          for (const issue of error.issues) {
            if (issue.code === "invalid_union") {
              issue.unionErrors.map(processError);
            } else if (issue.code === "invalid_return_type") {
              processError(issue.returnTypeError);
            } else if (issue.code === "invalid_arguments") {
              processError(issue.argumentsError);
            } else if (issue.path.length === 0) {
              fieldErrors._errors.push(mapper(issue));
            } else {
              let curr = fieldErrors;
              let i = 0;
              while (i < issue.path.length) {
                const el = issue.path[i];
                const terminal = i === issue.path.length - 1;
                if (!terminal) {
                  curr[el] = curr[el] || { _errors: [] };
                } else {
                  curr[el] = curr[el] || { _errors: [] };
                  curr[el]._errors.push(mapper(issue));
                }
                curr = curr[el];
                i++;
              }
            }
          }
        };
        processError(this);
        return fieldErrors;
      }
      static assert(value) {
        if (!(value instanceof _ZodError)) {
          throw new Error(`Not a ZodError: ${value}`);
        }
      }
      toString() {
        return this.message;
      }
      get message() {
        return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
      }
      get isEmpty() {
        return this.issues.length === 0;
      }
      flatten(mapper = (issue) => issue.message) {
        const fieldErrors = {};
        const formErrors = [];
        for (const sub of this.issues) {
          if (sub.path.length > 0) {
            const firstEl = sub.path[0];
            fieldErrors[firstEl] = fieldErrors[firstEl] || [];
            fieldErrors[firstEl].push(mapper(sub));
          } else {
            formErrors.push(mapper(sub));
          }
        }
        return { formErrors, fieldErrors };
      }
      get formErrors() {
        return this.flatten();
      }
    };
    ZodError.create = (issues) => {
      const error = new ZodError(issues);
      return error;
    };
  }
});

// node_modules/zod/v3/locales/en.js
var errorMap, en_default;
var init_en = __esm({
  "node_modules/zod/v3/locales/en.js"() {
    init_ZodError();
    init_util();
    errorMap = (issue, _ctx) => {
      let message;
      switch (issue.code) {
        case ZodIssueCode.invalid_type:
          if (issue.received === ZodParsedType.undefined) {
            message = "Required";
          } else {
            message = `Expected ${issue.expected}, received ${issue.received}`;
          }
          break;
        case ZodIssueCode.invalid_literal:
          message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
          break;
        case ZodIssueCode.unrecognized_keys:
          message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
          break;
        case ZodIssueCode.invalid_union:
          message = `Invalid input`;
          break;
        case ZodIssueCode.invalid_union_discriminator:
          message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
          break;
        case ZodIssueCode.invalid_enum_value:
          message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
          break;
        case ZodIssueCode.invalid_arguments:
          message = `Invalid function arguments`;
          break;
        case ZodIssueCode.invalid_return_type:
          message = `Invalid function return type`;
          break;
        case ZodIssueCode.invalid_date:
          message = `Invalid date`;
          break;
        case ZodIssueCode.invalid_string:
          if (typeof issue.validation === "object") {
            if ("includes" in issue.validation) {
              message = `Invalid input: must include "${issue.validation.includes}"`;
              if (typeof issue.validation.position === "number") {
                message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
              }
            } else if ("startsWith" in issue.validation) {
              message = `Invalid input: must start with "${issue.validation.startsWith}"`;
            } else if ("endsWith" in issue.validation) {
              message = `Invalid input: must end with "${issue.validation.endsWith}"`;
            } else {
              util.assertNever(issue.validation);
            }
          } else if (issue.validation !== "regex") {
            message = `Invalid ${issue.validation}`;
          } else {
            message = "Invalid";
          }
          break;
        case ZodIssueCode.too_small:
          if (issue.type === "array")
            message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
          else if (issue.type === "string")
            message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
          else if (issue.type === "number")
            message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
          else if (issue.type === "bigint")
            message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
          else if (issue.type === "date")
            message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
          else
            message = "Invalid input";
          break;
        case ZodIssueCode.too_big:
          if (issue.type === "array")
            message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
          else if (issue.type === "string")
            message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
          else if (issue.type === "number")
            message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
          else if (issue.type === "bigint")
            message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
          else if (issue.type === "date")
            message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
          else
            message = "Invalid input";
          break;
        case ZodIssueCode.custom:
          message = `Invalid input`;
          break;
        case ZodIssueCode.invalid_intersection_types:
          message = `Intersection results could not be merged`;
          break;
        case ZodIssueCode.not_multiple_of:
          message = `Number must be a multiple of ${issue.multipleOf}`;
          break;
        case ZodIssueCode.not_finite:
          message = "Number must be finite";
          break;
        default:
          message = _ctx.defaultError;
          util.assertNever(issue);
      }
      return { message };
    };
    en_default = errorMap;
  }
});

// node_modules/zod/v3/errors.js
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}
var overrideErrorMap;
var init_errors2 = __esm({
  "node_modules/zod/v3/errors.js"() {
    init_en();
    overrideErrorMap = en_default;
  }
});

// node_modules/zod/v3/helpers/parseUtil.js
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var makeIssue, EMPTY_PATH, ParseStatus, INVALID, DIRTY, OK, isAborted, isDirty, isValid, isAsync;
var init_parseUtil = __esm({
  "node_modules/zod/v3/helpers/parseUtil.js"() {
    init_errors2();
    init_en();
    makeIssue = (params) => {
      const { data, path, errorMaps, issueData } = params;
      const fullPath = [...path, ...issueData.path || []];
      const fullIssue = {
        ...issueData,
        path: fullPath
      };
      if (issueData.message !== void 0) {
        return {
          ...issueData,
          path: fullPath,
          message: issueData.message
        };
      }
      let errorMessage = "";
      const maps = errorMaps.filter((m) => !!m).slice().reverse();
      for (const map of maps) {
        errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
      }
      return {
        ...issueData,
        path: fullPath,
        message: errorMessage
      };
    };
    EMPTY_PATH = [];
    ParseStatus = class _ParseStatus {
      constructor() {
        this.value = "valid";
      }
      dirty() {
        if (this.value === "valid")
          this.value = "dirty";
      }
      abort() {
        if (this.value !== "aborted")
          this.value = "aborted";
      }
      static mergeArray(status, results) {
        const arrayValue = [];
        for (const s of results) {
          if (s.status === "aborted")
            return INVALID;
          if (s.status === "dirty")
            status.dirty();
          arrayValue.push(s.value);
        }
        return { status: status.value, value: arrayValue };
      }
      static async mergeObjectAsync(status, pairs) {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value
          });
        }
        return _ParseStatus.mergeObjectSync(status, syncPairs);
      }
      static mergeObjectSync(status, pairs) {
        const finalObject = {};
        for (const pair of pairs) {
          const { key, value } = pair;
          if (key.status === "aborted")
            return INVALID;
          if (value.status === "aborted")
            return INVALID;
          if (key.status === "dirty")
            status.dirty();
          if (value.status === "dirty")
            status.dirty();
          if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
            finalObject[key.value] = value.value;
          }
        }
        return { status: status.value, value: finalObject };
      }
    };
    INVALID = Object.freeze({
      status: "aborted"
    });
    DIRTY = (value) => ({ status: "dirty", value });
    OK = (value) => ({ status: "valid", value });
    isAborted = (x) => x.status === "aborted";
    isDirty = (x) => x.status === "dirty";
    isValid = (x) => x.status === "valid";
    isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
  }
});

// node_modules/zod/v3/helpers/typeAliases.js
var init_typeAliases = __esm({
  "node_modules/zod/v3/helpers/typeAliases.js"() {
  }
});

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
var init_errorUtil = __esm({
  "node_modules/zod/v3/helpers/errorUtil.js"() {
    (function(errorUtil2) {
      errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
      errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
    })(errorUtil || (errorUtil = {}));
  }
});

// node_modules/zod/v3/types.js
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var ParseInputLazyPath, handleResult, ZodType, cuidRegex, cuid2Regex, ulidRegex, uuidRegex, nanoidRegex, jwtRegex, durationRegex, emailRegex, _emojiRegex, emojiRegex, ipv4Regex, ipv4CidrRegex, ipv6Regex, ipv6CidrRegex, base64Regex, base64urlRegex, dateRegexSource, dateRegex, ZodString, ZodNumber, ZodBigInt, ZodBoolean, ZodDate, ZodSymbol, ZodUndefined, ZodNull, ZodAny, ZodUnknown, ZodNever, ZodVoid, ZodArray, ZodObject, ZodUnion, getDiscriminator, ZodDiscriminatedUnion, ZodIntersection, ZodTuple, ZodRecord, ZodMap, ZodSet, ZodFunction, ZodLazy, ZodLiteral, ZodEnum, ZodNativeEnum, ZodPromise, ZodEffects, ZodOptional, ZodNullable, ZodDefault, ZodCatch, ZodNaN, BRAND, ZodBranded, ZodPipeline, ZodReadonly, late, ZodFirstPartyTypeKind, instanceOfType, stringType, numberType, nanType, bigIntType, booleanType, dateType, symbolType, undefinedType, nullType, anyType, unknownType, neverType, voidType, arrayType, objectType, strictObjectType, unionType, discriminatedUnionType, intersectionType, tupleType, recordType, mapType, setType, functionType, lazyType, literalType, enumType, nativeEnumType, promiseType, effectsType, optionalType, nullableType, preprocessType, pipelineType, ostring, onumber, oboolean, coerce, NEVER;
var init_types = __esm({
  "node_modules/zod/v3/types.js"() {
    init_ZodError();
    init_errors2();
    init_errorUtil();
    init_parseUtil();
    init_util();
    ParseInputLazyPath = class {
      constructor(parent, value, path, key) {
        this._cachedPath = [];
        this.parent = parent;
        this.data = value;
        this._path = path;
        this._key = key;
      }
      get path() {
        if (!this._cachedPath.length) {
          if (Array.isArray(this._key)) {
            this._cachedPath.push(...this._path, ...this._key);
          } else {
            this._cachedPath.push(...this._path, this._key);
          }
        }
        return this._cachedPath;
      }
    };
    handleResult = (ctx, result) => {
      if (isValid(result)) {
        return { success: true, data: result.value };
      } else {
        if (!ctx.common.issues.length) {
          throw new Error("Validation failed but no issues detected.");
        }
        return {
          success: false,
          get error() {
            if (this._error)
              return this._error;
            const error = new ZodError(ctx.common.issues);
            this._error = error;
            return this._error;
          }
        };
      }
    };
    ZodType = class {
      get description() {
        return this._def.description;
      }
      _getType(input) {
        return getParsedType(input.data);
      }
      _getOrReturnCtx(input, ctx) {
        return ctx || {
          common: input.parent.common,
          data: input.data,
          parsedType: getParsedType(input.data),
          schemaErrorMap: this._def.errorMap,
          path: input.path,
          parent: input.parent
        };
      }
      _processInputParams(input) {
        return {
          status: new ParseStatus(),
          ctx: {
            common: input.parent.common,
            data: input.data,
            parsedType: getParsedType(input.data),
            schemaErrorMap: this._def.errorMap,
            path: input.path,
            parent: input.parent
          }
        };
      }
      _parseSync(input) {
        const result = this._parse(input);
        if (isAsync(result)) {
          throw new Error("Synchronous parse encountered promise.");
        }
        return result;
      }
      _parseAsync(input) {
        const result = this._parse(input);
        return Promise.resolve(result);
      }
      parse(data, params) {
        const result = this.safeParse(data, params);
        if (result.success)
          return result.data;
        throw result.error;
      }
      safeParse(data, params) {
        const ctx = {
          common: {
            issues: [],
            async: params?.async ?? false,
            contextualErrorMap: params?.errorMap
          },
          path: params?.path || [],
          schemaErrorMap: this._def.errorMap,
          parent: null,
          data,
          parsedType: getParsedType(data)
        };
        const result = this._parseSync({ data, path: ctx.path, parent: ctx });
        return handleResult(ctx, result);
      }
      "~validate"(data) {
        const ctx = {
          common: {
            issues: [],
            async: !!this["~standard"].async
          },
          path: [],
          schemaErrorMap: this._def.errorMap,
          parent: null,
          data,
          parsedType: getParsedType(data)
        };
        if (!this["~standard"].async) {
          try {
            const result = this._parseSync({ data, path: [], parent: ctx });
            return isValid(result) ? {
              value: result.value
            } : {
              issues: ctx.common.issues
            };
          } catch (err) {
            if (err?.message?.toLowerCase()?.includes("encountered")) {
              this["~standard"].async = true;
            }
            ctx.common = {
              issues: [],
              async: true
            };
          }
        }
        return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        });
      }
      async parseAsync(data, params) {
        const result = await this.safeParseAsync(data, params);
        if (result.success)
          return result.data;
        throw result.error;
      }
      async safeParseAsync(data, params) {
        const ctx = {
          common: {
            issues: [],
            contextualErrorMap: params?.errorMap,
            async: true
          },
          path: params?.path || [],
          schemaErrorMap: this._def.errorMap,
          parent: null,
          data,
          parsedType: getParsedType(data)
        };
        const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
        const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
        return handleResult(ctx, result);
      }
      refine(check, message) {
        const getIssueProperties = (val) => {
          if (typeof message === "string" || typeof message === "undefined") {
            return { message };
          } else if (typeof message === "function") {
            return message(val);
          } else {
            return message;
          }
        };
        return this._refinement((val, ctx) => {
          const result = check(val);
          const setError = () => ctx.addIssue({
            code: ZodIssueCode.custom,
            ...getIssueProperties(val)
          });
          if (typeof Promise !== "undefined" && result instanceof Promise) {
            return result.then((data) => {
              if (!data) {
                setError();
                return false;
              } else {
                return true;
              }
            });
          }
          if (!result) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      refinement(check, refinementData) {
        return this._refinement((val, ctx) => {
          if (!check(val)) {
            ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
            return false;
          } else {
            return true;
          }
        });
      }
      _refinement(refinement) {
        return new ZodEffects({
          schema: this,
          typeName: ZodFirstPartyTypeKind.ZodEffects,
          effect: { type: "refinement", refinement }
        });
      }
      superRefine(refinement) {
        return this._refinement(refinement);
      }
      constructor(def) {
        this.spa = this.safeParseAsync;
        this._def = def;
        this.parse = this.parse.bind(this);
        this.safeParse = this.safeParse.bind(this);
        this.parseAsync = this.parseAsync.bind(this);
        this.safeParseAsync = this.safeParseAsync.bind(this);
        this.spa = this.spa.bind(this);
        this.refine = this.refine.bind(this);
        this.refinement = this.refinement.bind(this);
        this.superRefine = this.superRefine.bind(this);
        this.optional = this.optional.bind(this);
        this.nullable = this.nullable.bind(this);
        this.nullish = this.nullish.bind(this);
        this.array = this.array.bind(this);
        this.promise = this.promise.bind(this);
        this.or = this.or.bind(this);
        this.and = this.and.bind(this);
        this.transform = this.transform.bind(this);
        this.brand = this.brand.bind(this);
        this.default = this.default.bind(this);
        this.catch = this.catch.bind(this);
        this.describe = this.describe.bind(this);
        this.pipe = this.pipe.bind(this);
        this.readonly = this.readonly.bind(this);
        this.isNullable = this.isNullable.bind(this);
        this.isOptional = this.isOptional.bind(this);
        this["~standard"] = {
          version: 1,
          vendor: "zod",
          validate: (data) => this["~validate"](data)
        };
      }
      optional() {
        return ZodOptional.create(this, this._def);
      }
      nullable() {
        return ZodNullable.create(this, this._def);
      }
      nullish() {
        return this.nullable().optional();
      }
      array() {
        return ZodArray.create(this);
      }
      promise() {
        return ZodPromise.create(this, this._def);
      }
      or(option2) {
        return ZodUnion.create([this, option2], this._def);
      }
      and(incoming) {
        return ZodIntersection.create(this, incoming, this._def);
      }
      transform(transform) {
        return new ZodEffects({
          ...processCreateParams(this._def),
          schema: this,
          typeName: ZodFirstPartyTypeKind.ZodEffects,
          effect: { type: "transform", transform }
        });
      }
      default(def) {
        const defaultValueFunc = typeof def === "function" ? def : () => def;
        return new ZodDefault({
          ...processCreateParams(this._def),
          innerType: this,
          defaultValue: defaultValueFunc,
          typeName: ZodFirstPartyTypeKind.ZodDefault
        });
      }
      brand() {
        return new ZodBranded({
          typeName: ZodFirstPartyTypeKind.ZodBranded,
          type: this,
          ...processCreateParams(this._def)
        });
      }
      catch(def) {
        const catchValueFunc = typeof def === "function" ? def : () => def;
        return new ZodCatch({
          ...processCreateParams(this._def),
          innerType: this,
          catchValue: catchValueFunc,
          typeName: ZodFirstPartyTypeKind.ZodCatch
        });
      }
      describe(description) {
        const This = this.constructor;
        return new This({
          ...this._def,
          description
        });
      }
      pipe(target) {
        return ZodPipeline.create(this, target);
      }
      readonly() {
        return ZodReadonly.create(this);
      }
      isOptional() {
        return this.safeParse(void 0).success;
      }
      isNullable() {
        return this.safeParse(null).success;
      }
    };
    cuidRegex = /^c[^\s-]{8,}$/i;
    cuid2Regex = /^[0-9a-z]+$/;
    ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
    uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
    nanoidRegex = /^[a-z0-9_-]{21}$/i;
    jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
    durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
    emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
    _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
    ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
    ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
    ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
    base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
    base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
    dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
    dateRegex = new RegExp(`^${dateRegexSource}$`);
    ZodString = class _ZodString extends ZodType {
      _parse(input) {
        if (this._def.coerce) {
          input.data = String(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.string) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.string,
            received: ctx2.parsedType
          });
          return INVALID;
        }
        const status = new ParseStatus();
        let ctx = void 0;
        for (const check of this._def.checks) {
          if (check.kind === "min") {
            if (input.data.length < check.value) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                minimum: check.value,
                type: "string",
                inclusive: true,
                exact: false,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "max") {
            if (input.data.length > check.value) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                maximum: check.value,
                type: "string",
                inclusive: true,
                exact: false,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "length") {
            const tooBig = input.data.length > check.value;
            const tooSmall = input.data.length < check.value;
            if (tooBig || tooSmall) {
              ctx = this._getOrReturnCtx(input, ctx);
              if (tooBig) {
                addIssueToContext(ctx, {
                  code: ZodIssueCode.too_big,
                  maximum: check.value,
                  type: "string",
                  inclusive: true,
                  exact: true,
                  message: check.message
                });
              } else if (tooSmall) {
                addIssueToContext(ctx, {
                  code: ZodIssueCode.too_small,
                  minimum: check.value,
                  type: "string",
                  inclusive: true,
                  exact: true,
                  message: check.message
                });
              }
              status.dirty();
            }
          } else if (check.kind === "email") {
            if (!emailRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "email",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "emoji") {
            if (!emojiRegex) {
              emojiRegex = new RegExp(_emojiRegex, "u");
            }
            if (!emojiRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "emoji",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "uuid") {
            if (!uuidRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "uuid",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "nanoid") {
            if (!nanoidRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "nanoid",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "cuid") {
            if (!cuidRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "cuid",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "cuid2") {
            if (!cuid2Regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "cuid2",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "ulid") {
            if (!ulidRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "ulid",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "url") {
            try {
              new URL(input.data);
            } catch {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "url",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "regex") {
            check.regex.lastIndex = 0;
            const testResult = check.regex.test(input.data);
            if (!testResult) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "regex",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "trim") {
            input.data = input.data.trim();
          } else if (check.kind === "includes") {
            if (!input.data.includes(check.value, check.position)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: { includes: check.value, position: check.position },
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "toLowerCase") {
            input.data = input.data.toLowerCase();
          } else if (check.kind === "toUpperCase") {
            input.data = input.data.toUpperCase();
          } else if (check.kind === "startsWith") {
            if (!input.data.startsWith(check.value)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: { startsWith: check.value },
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "endsWith") {
            if (!input.data.endsWith(check.value)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: { endsWith: check.value },
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "datetime") {
            const regex = datetimeRegex(check);
            if (!regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: "datetime",
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "date") {
            const regex = dateRegex;
            if (!regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: "date",
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "time") {
            const regex = timeRegex(check);
            if (!regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_string,
                validation: "time",
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "duration") {
            if (!durationRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "duration",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "ip") {
            if (!isValidIP(input.data, check.version)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "ip",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "jwt") {
            if (!isValidJWT(input.data, check.alg)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "jwt",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "cidr") {
            if (!isValidCidr(input.data, check.version)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "cidr",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "base64") {
            if (!base64Regex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "base64",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "base64url") {
            if (!base64urlRegex.test(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                validation: "base64url",
                code: ZodIssueCode.invalid_string,
                message: check.message
              });
              status.dirty();
            }
          } else {
            util.assertNever(check);
          }
        }
        return { status: status.value, value: input.data };
      }
      _regex(regex, validation, message) {
        return this.refinement((data) => regex.test(data), {
          validation,
          code: ZodIssueCode.invalid_string,
          ...errorUtil.errToObj(message)
        });
      }
      _addCheck(check) {
        return new _ZodString({
          ...this._def,
          checks: [...this._def.checks, check]
        });
      }
      email(message) {
        return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
      }
      url(message) {
        return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
      }
      emoji(message) {
        return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
      }
      uuid(message) {
        return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
      }
      nanoid(message) {
        return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
      }
      cuid(message) {
        return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
      }
      cuid2(message) {
        return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
      }
      ulid(message) {
        return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
      }
      base64(message) {
        return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
      }
      base64url(message) {
        return this._addCheck({
          kind: "base64url",
          ...errorUtil.errToObj(message)
        });
      }
      jwt(options) {
        return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
      }
      ip(options) {
        return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
      }
      cidr(options) {
        return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
      }
      datetime(options) {
        if (typeof options === "string") {
          return this._addCheck({
            kind: "datetime",
            precision: null,
            offset: false,
            local: false,
            message: options
          });
        }
        return this._addCheck({
          kind: "datetime",
          precision: typeof options?.precision === "undefined" ? null : options?.precision,
          offset: options?.offset ?? false,
          local: options?.local ?? false,
          ...errorUtil.errToObj(options?.message)
        });
      }
      date(message) {
        return this._addCheck({ kind: "date", message });
      }
      time(options) {
        if (typeof options === "string") {
          return this._addCheck({
            kind: "time",
            precision: null,
            message: options
          });
        }
        return this._addCheck({
          kind: "time",
          precision: typeof options?.precision === "undefined" ? null : options?.precision,
          ...errorUtil.errToObj(options?.message)
        });
      }
      duration(message) {
        return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
      }
      regex(regex, message) {
        return this._addCheck({
          kind: "regex",
          regex,
          ...errorUtil.errToObj(message)
        });
      }
      includes(value, options) {
        return this._addCheck({
          kind: "includes",
          value,
          position: options?.position,
          ...errorUtil.errToObj(options?.message)
        });
      }
      startsWith(value, message) {
        return this._addCheck({
          kind: "startsWith",
          value,
          ...errorUtil.errToObj(message)
        });
      }
      endsWith(value, message) {
        return this._addCheck({
          kind: "endsWith",
          value,
          ...errorUtil.errToObj(message)
        });
      }
      min(minLength, message) {
        return this._addCheck({
          kind: "min",
          value: minLength,
          ...errorUtil.errToObj(message)
        });
      }
      max(maxLength, message) {
        return this._addCheck({
          kind: "max",
          value: maxLength,
          ...errorUtil.errToObj(message)
        });
      }
      length(len, message) {
        return this._addCheck({
          kind: "length",
          value: len,
          ...errorUtil.errToObj(message)
        });
      }
      /**
       * Equivalent to `.min(1)`
       */
      nonempty(message) {
        return this.min(1, errorUtil.errToObj(message));
      }
      trim() {
        return new _ZodString({
          ...this._def,
          checks: [...this._def.checks, { kind: "trim" }]
        });
      }
      toLowerCase() {
        return new _ZodString({
          ...this._def,
          checks: [...this._def.checks, { kind: "toLowerCase" }]
        });
      }
      toUpperCase() {
        return new _ZodString({
          ...this._def,
          checks: [...this._def.checks, { kind: "toUpperCase" }]
        });
      }
      get isDatetime() {
        return !!this._def.checks.find((ch) => ch.kind === "datetime");
      }
      get isDate() {
        return !!this._def.checks.find((ch) => ch.kind === "date");
      }
      get isTime() {
        return !!this._def.checks.find((ch) => ch.kind === "time");
      }
      get isDuration() {
        return !!this._def.checks.find((ch) => ch.kind === "duration");
      }
      get isEmail() {
        return !!this._def.checks.find((ch) => ch.kind === "email");
      }
      get isURL() {
        return !!this._def.checks.find((ch) => ch.kind === "url");
      }
      get isEmoji() {
        return !!this._def.checks.find((ch) => ch.kind === "emoji");
      }
      get isUUID() {
        return !!this._def.checks.find((ch) => ch.kind === "uuid");
      }
      get isNANOID() {
        return !!this._def.checks.find((ch) => ch.kind === "nanoid");
      }
      get isCUID() {
        return !!this._def.checks.find((ch) => ch.kind === "cuid");
      }
      get isCUID2() {
        return !!this._def.checks.find((ch) => ch.kind === "cuid2");
      }
      get isULID() {
        return !!this._def.checks.find((ch) => ch.kind === "ulid");
      }
      get isIP() {
        return !!this._def.checks.find((ch) => ch.kind === "ip");
      }
      get isCIDR() {
        return !!this._def.checks.find((ch) => ch.kind === "cidr");
      }
      get isBase64() {
        return !!this._def.checks.find((ch) => ch.kind === "base64");
      }
      get isBase64url() {
        return !!this._def.checks.find((ch) => ch.kind === "base64url");
      }
      get minLength() {
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          }
        }
        return min;
      }
      get maxLength() {
        let max = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return max;
      }
    };
    ZodString.create = (params) => {
      return new ZodString({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodString,
        coerce: params?.coerce ?? false,
        ...processCreateParams(params)
      });
    };
    ZodNumber = class _ZodNumber extends ZodType {
      constructor() {
        super(...arguments);
        this.min = this.gte;
        this.max = this.lte;
        this.step = this.multipleOf;
      }
      _parse(input) {
        if (this._def.coerce) {
          input.data = Number(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.number) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.number,
            received: ctx2.parsedType
          });
          return INVALID;
        }
        let ctx = void 0;
        const status = new ParseStatus();
        for (const check of this._def.checks) {
          if (check.kind === "int") {
            if (!util.isInteger(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: "integer",
                received: "float",
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "min") {
            const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
            if (tooSmall) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                minimum: check.value,
                type: "number",
                inclusive: check.inclusive,
                exact: false,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "max") {
            const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
            if (tooBig) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                maximum: check.value,
                type: "number",
                inclusive: check.inclusive,
                exact: false,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "multipleOf") {
            if (floatSafeRemainder(input.data, check.value) !== 0) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.not_multiple_of,
                multipleOf: check.value,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "finite") {
            if (!Number.isFinite(input.data)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.not_finite,
                message: check.message
              });
              status.dirty();
            }
          } else {
            util.assertNever(check);
          }
        }
        return { status: status.value, value: input.data };
      }
      gte(value, message) {
        return this.setLimit("min", value, true, errorUtil.toString(message));
      }
      gt(value, message) {
        return this.setLimit("min", value, false, errorUtil.toString(message));
      }
      lte(value, message) {
        return this.setLimit("max", value, true, errorUtil.toString(message));
      }
      lt(value, message) {
        return this.setLimit("max", value, false, errorUtil.toString(message));
      }
      setLimit(kind, value, inclusive, message) {
        return new _ZodNumber({
          ...this._def,
          checks: [
            ...this._def.checks,
            {
              kind,
              value,
              inclusive,
              message: errorUtil.toString(message)
            }
          ]
        });
      }
      _addCheck(check) {
        return new _ZodNumber({
          ...this._def,
          checks: [...this._def.checks, check]
        });
      }
      int(message) {
        return this._addCheck({
          kind: "int",
          message: errorUtil.toString(message)
        });
      }
      positive(message) {
        return this._addCheck({
          kind: "min",
          value: 0,
          inclusive: false,
          message: errorUtil.toString(message)
        });
      }
      negative(message) {
        return this._addCheck({
          kind: "max",
          value: 0,
          inclusive: false,
          message: errorUtil.toString(message)
        });
      }
      nonpositive(message) {
        return this._addCheck({
          kind: "max",
          value: 0,
          inclusive: true,
          message: errorUtil.toString(message)
        });
      }
      nonnegative(message) {
        return this._addCheck({
          kind: "min",
          value: 0,
          inclusive: true,
          message: errorUtil.toString(message)
        });
      }
      multipleOf(value, message) {
        return this._addCheck({
          kind: "multipleOf",
          value,
          message: errorUtil.toString(message)
        });
      }
      finite(message) {
        return this._addCheck({
          kind: "finite",
          message: errorUtil.toString(message)
        });
      }
      safe(message) {
        return this._addCheck({
          kind: "min",
          inclusive: true,
          value: Number.MIN_SAFE_INTEGER,
          message: errorUtil.toString(message)
        })._addCheck({
          kind: "max",
          inclusive: true,
          value: Number.MAX_SAFE_INTEGER,
          message: errorUtil.toString(message)
        });
      }
      get minValue() {
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          }
        }
        return min;
      }
      get maxValue() {
        let max = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return max;
      }
      get isInt() {
        return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
      }
      get isFinite() {
        let max = null;
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
            return true;
          } else if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          } else if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return Number.isFinite(min) && Number.isFinite(max);
      }
    };
    ZodNumber.create = (params) => {
      return new ZodNumber({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodNumber,
        coerce: params?.coerce || false,
        ...processCreateParams(params)
      });
    };
    ZodBigInt = class _ZodBigInt extends ZodType {
      constructor() {
        super(...arguments);
        this.min = this.gte;
        this.max = this.lte;
      }
      _parse(input) {
        if (this._def.coerce) {
          try {
            input.data = BigInt(input.data);
          } catch {
            return this._getInvalidInput(input);
          }
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.bigint) {
          return this._getInvalidInput(input);
        }
        let ctx = void 0;
        const status = new ParseStatus();
        for (const check of this._def.checks) {
          if (check.kind === "min") {
            const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
            if (tooSmall) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                type: "bigint",
                minimum: check.value,
                inclusive: check.inclusive,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "max") {
            const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
            if (tooBig) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                type: "bigint",
                maximum: check.value,
                inclusive: check.inclusive,
                message: check.message
              });
              status.dirty();
            }
          } else if (check.kind === "multipleOf") {
            if (input.data % check.value !== BigInt(0)) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.not_multiple_of,
                multipleOf: check.value,
                message: check.message
              });
              status.dirty();
            }
          } else {
            util.assertNever(check);
          }
        }
        return { status: status.value, value: input.data };
      }
      _getInvalidInput(input) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.bigint,
          received: ctx.parsedType
        });
        return INVALID;
      }
      gte(value, message) {
        return this.setLimit("min", value, true, errorUtil.toString(message));
      }
      gt(value, message) {
        return this.setLimit("min", value, false, errorUtil.toString(message));
      }
      lte(value, message) {
        return this.setLimit("max", value, true, errorUtil.toString(message));
      }
      lt(value, message) {
        return this.setLimit("max", value, false, errorUtil.toString(message));
      }
      setLimit(kind, value, inclusive, message) {
        return new _ZodBigInt({
          ...this._def,
          checks: [
            ...this._def.checks,
            {
              kind,
              value,
              inclusive,
              message: errorUtil.toString(message)
            }
          ]
        });
      }
      _addCheck(check) {
        return new _ZodBigInt({
          ...this._def,
          checks: [...this._def.checks, check]
        });
      }
      positive(message) {
        return this._addCheck({
          kind: "min",
          value: BigInt(0),
          inclusive: false,
          message: errorUtil.toString(message)
        });
      }
      negative(message) {
        return this._addCheck({
          kind: "max",
          value: BigInt(0),
          inclusive: false,
          message: errorUtil.toString(message)
        });
      }
      nonpositive(message) {
        return this._addCheck({
          kind: "max",
          value: BigInt(0),
          inclusive: true,
          message: errorUtil.toString(message)
        });
      }
      nonnegative(message) {
        return this._addCheck({
          kind: "min",
          value: BigInt(0),
          inclusive: true,
          message: errorUtil.toString(message)
        });
      }
      multipleOf(value, message) {
        return this._addCheck({
          kind: "multipleOf",
          value,
          message: errorUtil.toString(message)
        });
      }
      get minValue() {
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          }
        }
        return min;
      }
      get maxValue() {
        let max = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return max;
      }
    };
    ZodBigInt.create = (params) => {
      return new ZodBigInt({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodBigInt,
        coerce: params?.coerce ?? false,
        ...processCreateParams(params)
      });
    };
    ZodBoolean = class extends ZodType {
      _parse(input) {
        if (this._def.coerce) {
          input.data = Boolean(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.boolean) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.boolean,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodBoolean.create = (params) => {
      return new ZodBoolean({
        typeName: ZodFirstPartyTypeKind.ZodBoolean,
        coerce: params?.coerce || false,
        ...processCreateParams(params)
      });
    };
    ZodDate = class _ZodDate extends ZodType {
      _parse(input) {
        if (this._def.coerce) {
          input.data = new Date(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.date) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.date,
            received: ctx2.parsedType
          });
          return INVALID;
        }
        if (Number.isNaN(input.data.getTime())) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_date
          });
          return INVALID;
        }
        const status = new ParseStatus();
        let ctx = void 0;
        for (const check of this._def.checks) {
          if (check.kind === "min") {
            if (input.data.getTime() < check.value) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                message: check.message,
                inclusive: true,
                exact: false,
                minimum: check.value,
                type: "date"
              });
              status.dirty();
            }
          } else if (check.kind === "max") {
            if (input.data.getTime() > check.value) {
              ctx = this._getOrReturnCtx(input, ctx);
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                message: check.message,
                inclusive: true,
                exact: false,
                maximum: check.value,
                type: "date"
              });
              status.dirty();
            }
          } else {
            util.assertNever(check);
          }
        }
        return {
          status: status.value,
          value: new Date(input.data.getTime())
        };
      }
      _addCheck(check) {
        return new _ZodDate({
          ...this._def,
          checks: [...this._def.checks, check]
        });
      }
      min(minDate, message) {
        return this._addCheck({
          kind: "min",
          value: minDate.getTime(),
          message: errorUtil.toString(message)
        });
      }
      max(maxDate, message) {
        return this._addCheck({
          kind: "max",
          value: maxDate.getTime(),
          message: errorUtil.toString(message)
        });
      }
      get minDate() {
        let min = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "min") {
            if (min === null || ch.value > min)
              min = ch.value;
          }
        }
        return min != null ? new Date(min) : null;
      }
      get maxDate() {
        let max = null;
        for (const ch of this._def.checks) {
          if (ch.kind === "max") {
            if (max === null || ch.value < max)
              max = ch.value;
          }
        }
        return max != null ? new Date(max) : null;
      }
    };
    ZodDate.create = (params) => {
      return new ZodDate({
        checks: [],
        coerce: params?.coerce || false,
        typeName: ZodFirstPartyTypeKind.ZodDate,
        ...processCreateParams(params)
      });
    };
    ZodSymbol = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.symbol) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.symbol,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodSymbol.create = (params) => {
      return new ZodSymbol({
        typeName: ZodFirstPartyTypeKind.ZodSymbol,
        ...processCreateParams(params)
      });
    };
    ZodUndefined = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.undefined) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.undefined,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodUndefined.create = (params) => {
      return new ZodUndefined({
        typeName: ZodFirstPartyTypeKind.ZodUndefined,
        ...processCreateParams(params)
      });
    };
    ZodNull = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.null) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.null,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodNull.create = (params) => {
      return new ZodNull({
        typeName: ZodFirstPartyTypeKind.ZodNull,
        ...processCreateParams(params)
      });
    };
    ZodAny = class extends ZodType {
      constructor() {
        super(...arguments);
        this._any = true;
      }
      _parse(input) {
        return OK(input.data);
      }
    };
    ZodAny.create = (params) => {
      return new ZodAny({
        typeName: ZodFirstPartyTypeKind.ZodAny,
        ...processCreateParams(params)
      });
    };
    ZodUnknown = class extends ZodType {
      constructor() {
        super(...arguments);
        this._unknown = true;
      }
      _parse(input) {
        return OK(input.data);
      }
    };
    ZodUnknown.create = (params) => {
      return new ZodUnknown({
        typeName: ZodFirstPartyTypeKind.ZodUnknown,
        ...processCreateParams(params)
      });
    };
    ZodNever = class extends ZodType {
      _parse(input) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.never,
          received: ctx.parsedType
        });
        return INVALID;
      }
    };
    ZodNever.create = (params) => {
      return new ZodNever({
        typeName: ZodFirstPartyTypeKind.ZodNever,
        ...processCreateParams(params)
      });
    };
    ZodVoid = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.undefined) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.void,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return OK(input.data);
      }
    };
    ZodVoid.create = (params) => {
      return new ZodVoid({
        typeName: ZodFirstPartyTypeKind.ZodVoid,
        ...processCreateParams(params)
      });
    };
    ZodArray = class _ZodArray extends ZodType {
      _parse(input) {
        const { ctx, status } = this._processInputParams(input);
        const def = this._def;
        if (ctx.parsedType !== ZodParsedType.array) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.array,
            received: ctx.parsedType
          });
          return INVALID;
        }
        if (def.exactLength !== null) {
          const tooBig = ctx.data.length > def.exactLength.value;
          const tooSmall = ctx.data.length < def.exactLength.value;
          if (tooBig || tooSmall) {
            addIssueToContext(ctx, {
              code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
              minimum: tooSmall ? def.exactLength.value : void 0,
              maximum: tooBig ? def.exactLength.value : void 0,
              type: "array",
              inclusive: true,
              exact: true,
              message: def.exactLength.message
            });
            status.dirty();
          }
        }
        if (def.minLength !== null) {
          if (ctx.data.length < def.minLength.value) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: def.minLength.value,
              type: "array",
              inclusive: true,
              exact: false,
              message: def.minLength.message
            });
            status.dirty();
          }
        }
        if (def.maxLength !== null) {
          if (ctx.data.length > def.maxLength.value) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: def.maxLength.value,
              type: "array",
              inclusive: true,
              exact: false,
              message: def.maxLength.message
            });
            status.dirty();
          }
        }
        if (ctx.common.async) {
          return Promise.all([...ctx.data].map((item, i) => {
            return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
          })).then((result2) => {
            return ParseStatus.mergeArray(status, result2);
          });
        }
        const result = [...ctx.data].map((item, i) => {
          return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
        });
        return ParseStatus.mergeArray(status, result);
      }
      get element() {
        return this._def.type;
      }
      min(minLength, message) {
        return new _ZodArray({
          ...this._def,
          minLength: { value: minLength, message: errorUtil.toString(message) }
        });
      }
      max(maxLength, message) {
        return new _ZodArray({
          ...this._def,
          maxLength: { value: maxLength, message: errorUtil.toString(message) }
        });
      }
      length(len, message) {
        return new _ZodArray({
          ...this._def,
          exactLength: { value: len, message: errorUtil.toString(message) }
        });
      }
      nonempty(message) {
        return this.min(1, message);
      }
    };
    ZodArray.create = (schema, params) => {
      return new ZodArray({
        type: schema,
        minLength: null,
        maxLength: null,
        exactLength: null,
        typeName: ZodFirstPartyTypeKind.ZodArray,
        ...processCreateParams(params)
      });
    };
    ZodObject = class _ZodObject extends ZodType {
      constructor() {
        super(...arguments);
        this._cached = null;
        this.nonstrict = this.passthrough;
        this.augment = this.extend;
      }
      _getCached() {
        if (this._cached !== null)
          return this._cached;
        const shape = this._def.shape();
        const keys = util.objectKeys(shape);
        this._cached = { shape, keys };
        return this._cached;
      }
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.object) {
          const ctx2 = this._getOrReturnCtx(input);
          addIssueToContext(ctx2, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.object,
            received: ctx2.parsedType
          });
          return INVALID;
        }
        const { status, ctx } = this._processInputParams(input);
        const { shape, keys: shapeKeys } = this._getCached();
        const extraKeys = [];
        if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
          for (const key in ctx.data) {
            if (!shapeKeys.includes(key)) {
              extraKeys.push(key);
            }
          }
        }
        const pairs = [];
        for (const key of shapeKeys) {
          const keyValidator = shape[key];
          const value = ctx.data[key];
          pairs.push({
            key: { status: "valid", value: key },
            value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
            alwaysSet: key in ctx.data
          });
        }
        if (this._def.catchall instanceof ZodNever) {
          const unknownKeys = this._def.unknownKeys;
          if (unknownKeys === "passthrough") {
            for (const key of extraKeys) {
              pairs.push({
                key: { status: "valid", value: key },
                value: { status: "valid", value: ctx.data[key] }
              });
            }
          } else if (unknownKeys === "strict") {
            if (extraKeys.length > 0) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.unrecognized_keys,
                keys: extraKeys
              });
              status.dirty();
            }
          } else if (unknownKeys === "strip") {
          } else {
            throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
          }
        } else {
          const catchall = this._def.catchall;
          for (const key of extraKeys) {
            const value = ctx.data[key];
            pairs.push({
              key: { status: "valid", value: key },
              value: catchall._parse(
                new ParseInputLazyPath(ctx, value, ctx.path, key)
                //, ctx.child(key), value, getParsedType(value)
              ),
              alwaysSet: key in ctx.data
            });
          }
        }
        if (ctx.common.async) {
          return Promise.resolve().then(async () => {
            const syncPairs = [];
            for (const pair of pairs) {
              const key = await pair.key;
              const value = await pair.value;
              syncPairs.push({
                key,
                value,
                alwaysSet: pair.alwaysSet
              });
            }
            return syncPairs;
          }).then((syncPairs) => {
            return ParseStatus.mergeObjectSync(status, syncPairs);
          });
        } else {
          return ParseStatus.mergeObjectSync(status, pairs);
        }
      }
      get shape() {
        return this._def.shape();
      }
      strict(message) {
        errorUtil.errToObj;
        return new _ZodObject({
          ...this._def,
          unknownKeys: "strict",
          ...message !== void 0 ? {
            errorMap: (issue, ctx) => {
              const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
              if (issue.code === "unrecognized_keys")
                return {
                  message: errorUtil.errToObj(message).message ?? defaultError
                };
              return {
                message: defaultError
              };
            }
          } : {}
        });
      }
      strip() {
        return new _ZodObject({
          ...this._def,
          unknownKeys: "strip"
        });
      }
      passthrough() {
        return new _ZodObject({
          ...this._def,
          unknownKeys: "passthrough"
        });
      }
      // const AugmentFactory =
      //   <Def extends ZodObjectDef>(def: Def) =>
      //   <Augmentation extends ZodRawShape>(
      //     augmentation: Augmentation
      //   ): ZodObject<
      //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
      //     Def["unknownKeys"],
      //     Def["catchall"]
      //   > => {
      //     return new ZodObject({
      //       ...def,
      //       shape: () => ({
      //         ...def.shape(),
      //         ...augmentation,
      //       }),
      //     }) as any;
      //   };
      extend(augmentation) {
        return new _ZodObject({
          ...this._def,
          shape: () => ({
            ...this._def.shape(),
            ...augmentation
          })
        });
      }
      /**
       * Prior to zod@1.0.12 there was a bug in the
       * inferred type of merged objects. Please
       * upgrade if you are experiencing issues.
       */
      merge(merging) {
        const merged = new _ZodObject({
          unknownKeys: merging._def.unknownKeys,
          catchall: merging._def.catchall,
          shape: () => ({
            ...this._def.shape(),
            ...merging._def.shape()
          }),
          typeName: ZodFirstPartyTypeKind.ZodObject
        });
        return merged;
      }
      // merge<
      //   Incoming extends AnyZodObject,
      //   Augmentation extends Incoming["shape"],
      //   NewOutput extends {
      //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
      //       ? Augmentation[k]["_output"]
      //       : k extends keyof Output
      //       ? Output[k]
      //       : never;
      //   },
      //   NewInput extends {
      //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
      //       ? Augmentation[k]["_input"]
      //       : k extends keyof Input
      //       ? Input[k]
      //       : never;
      //   }
      // >(
      //   merging: Incoming
      // ): ZodObject<
      //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
      //   Incoming["_def"]["unknownKeys"],
      //   Incoming["_def"]["catchall"],
      //   NewOutput,
      //   NewInput
      // > {
      //   const merged: any = new ZodObject({
      //     unknownKeys: merging._def.unknownKeys,
      //     catchall: merging._def.catchall,
      //     shape: () =>
      //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
      //     typeName: ZodFirstPartyTypeKind.ZodObject,
      //   }) as any;
      //   return merged;
      // }
      setKey(key, schema) {
        return this.augment({ [key]: schema });
      }
      // merge<Incoming extends AnyZodObject>(
      //   merging: Incoming
      // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
      // ZodObject<
      //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
      //   Incoming["_def"]["unknownKeys"],
      //   Incoming["_def"]["catchall"]
      // > {
      //   // const mergedShape = objectUtil.mergeShapes(
      //   //   this._def.shape(),
      //   //   merging._def.shape()
      //   // );
      //   const merged: any = new ZodObject({
      //     unknownKeys: merging._def.unknownKeys,
      //     catchall: merging._def.catchall,
      //     shape: () =>
      //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
      //     typeName: ZodFirstPartyTypeKind.ZodObject,
      //   }) as any;
      //   return merged;
      // }
      catchall(index) {
        return new _ZodObject({
          ...this._def,
          catchall: index
        });
      }
      pick(mask) {
        const shape = {};
        for (const key of util.objectKeys(mask)) {
          if (mask[key] && this.shape[key]) {
            shape[key] = this.shape[key];
          }
        }
        return new _ZodObject({
          ...this._def,
          shape: () => shape
        });
      }
      omit(mask) {
        const shape = {};
        for (const key of util.objectKeys(this.shape)) {
          if (!mask[key]) {
            shape[key] = this.shape[key];
          }
        }
        return new _ZodObject({
          ...this._def,
          shape: () => shape
        });
      }
      /**
       * @deprecated
       */
      deepPartial() {
        return deepPartialify(this);
      }
      partial(mask) {
        const newShape = {};
        for (const key of util.objectKeys(this.shape)) {
          const fieldSchema = this.shape[key];
          if (mask && !mask[key]) {
            newShape[key] = fieldSchema;
          } else {
            newShape[key] = fieldSchema.optional();
          }
        }
        return new _ZodObject({
          ...this._def,
          shape: () => newShape
        });
      }
      required(mask) {
        const newShape = {};
        for (const key of util.objectKeys(this.shape)) {
          if (mask && !mask[key]) {
            newShape[key] = this.shape[key];
          } else {
            const fieldSchema = this.shape[key];
            let newField = fieldSchema;
            while (newField instanceof ZodOptional) {
              newField = newField._def.innerType;
            }
            newShape[key] = newField;
          }
        }
        return new _ZodObject({
          ...this._def,
          shape: () => newShape
        });
      }
      keyof() {
        return createZodEnum(util.objectKeys(this.shape));
      }
    };
    ZodObject.create = (shape, params) => {
      return new ZodObject({
        shape: () => shape,
        unknownKeys: "strip",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params)
      });
    };
    ZodObject.strictCreate = (shape, params) => {
      return new ZodObject({
        shape: () => shape,
        unknownKeys: "strict",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params)
      });
    };
    ZodObject.lazycreate = (shape, params) => {
      return new ZodObject({
        shape,
        unknownKeys: "strip",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params)
      });
    };
    ZodUnion = class extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        const options = this._def.options;
        function handleResults(results) {
          for (const result of results) {
            if (result.result.status === "valid") {
              return result.result;
            }
          }
          for (const result of results) {
            if (result.result.status === "dirty") {
              ctx.common.issues.push(...result.ctx.common.issues);
              return result.result;
            }
          }
          const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_union,
            unionErrors
          });
          return INVALID;
        }
        if (ctx.common.async) {
          return Promise.all(options.map(async (option2) => {
            const childCtx = {
              ...ctx,
              common: {
                ...ctx.common,
                issues: []
              },
              parent: null
            };
            return {
              result: await option2._parseAsync({
                data: ctx.data,
                path: ctx.path,
                parent: childCtx
              }),
              ctx: childCtx
            };
          })).then(handleResults);
        } else {
          let dirty = void 0;
          const issues = [];
          for (const option2 of options) {
            const childCtx = {
              ...ctx,
              common: {
                ...ctx.common,
                issues: []
              },
              parent: null
            };
            const result = option2._parseSync({
              data: ctx.data,
              path: ctx.path,
              parent: childCtx
            });
            if (result.status === "valid") {
              return result;
            } else if (result.status === "dirty" && !dirty) {
              dirty = { result, ctx: childCtx };
            }
            if (childCtx.common.issues.length) {
              issues.push(childCtx.common.issues);
            }
          }
          if (dirty) {
            ctx.common.issues.push(...dirty.ctx.common.issues);
            return dirty.result;
          }
          const unionErrors = issues.map((issues2) => new ZodError(issues2));
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_union,
            unionErrors
          });
          return INVALID;
        }
      }
      get options() {
        return this._def.options;
      }
    };
    ZodUnion.create = (types, params) => {
      return new ZodUnion({
        options: types,
        typeName: ZodFirstPartyTypeKind.ZodUnion,
        ...processCreateParams(params)
      });
    };
    getDiscriminator = (type) => {
      if (type instanceof ZodLazy) {
        return getDiscriminator(type.schema);
      } else if (type instanceof ZodEffects) {
        return getDiscriminator(type.innerType());
      } else if (type instanceof ZodLiteral) {
        return [type.value];
      } else if (type instanceof ZodEnum) {
        return type.options;
      } else if (type instanceof ZodNativeEnum) {
        return util.objectValues(type.enum);
      } else if (type instanceof ZodDefault) {
        return getDiscriminator(type._def.innerType);
      } else if (type instanceof ZodUndefined) {
        return [void 0];
      } else if (type instanceof ZodNull) {
        return [null];
      } else if (type instanceof ZodOptional) {
        return [void 0, ...getDiscriminator(type.unwrap())];
      } else if (type instanceof ZodNullable) {
        return [null, ...getDiscriminator(type.unwrap())];
      } else if (type instanceof ZodBranded) {
        return getDiscriminator(type.unwrap());
      } else if (type instanceof ZodReadonly) {
        return getDiscriminator(type.unwrap());
      } else if (type instanceof ZodCatch) {
        return getDiscriminator(type._def.innerType);
      } else {
        return [];
      }
    };
    ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.object) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.object,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const discriminator = this.discriminator;
        const discriminatorValue = ctx.data[discriminator];
        const option2 = this.optionsMap.get(discriminatorValue);
        if (!option2) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_union_discriminator,
            options: Array.from(this.optionsMap.keys()),
            path: [discriminator]
          });
          return INVALID;
        }
        if (ctx.common.async) {
          return option2._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
        } else {
          return option2._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
        }
      }
      get discriminator() {
        return this._def.discriminator;
      }
      get options() {
        return this._def.options;
      }
      get optionsMap() {
        return this._def.optionsMap;
      }
      /**
       * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
       * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
       * have a different value for each object in the union.
       * @param discriminator the name of the discriminator property
       * @param types an array of object schemas
       * @param params
       */
      static create(discriminator, options, params) {
        const optionsMap = /* @__PURE__ */ new Map();
        for (const type of options) {
          const discriminatorValues = getDiscriminator(type.shape[discriminator]);
          if (!discriminatorValues.length) {
            throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
          }
          for (const value of discriminatorValues) {
            if (optionsMap.has(value)) {
              throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
            }
            optionsMap.set(value, type);
          }
        }
        return new _ZodDiscriminatedUnion({
          typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
          discriminator,
          options,
          optionsMap,
          ...processCreateParams(params)
        });
      }
    };
    ZodIntersection = class extends ZodType {
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        const handleParsed = (parsedLeft, parsedRight) => {
          if (isAborted(parsedLeft) || isAborted(parsedRight)) {
            return INVALID;
          }
          const merged = mergeValues(parsedLeft.value, parsedRight.value);
          if (!merged.valid) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_intersection_types
            });
            return INVALID;
          }
          if (isDirty(parsedLeft) || isDirty(parsedRight)) {
            status.dirty();
          }
          return { status: status.value, value: merged.data };
        };
        if (ctx.common.async) {
          return Promise.all([
            this._def.left._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            }),
            this._def.right._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            })
          ]).then(([left, right]) => handleParsed(left, right));
        } else {
          return handleParsed(this._def.left._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          }), this._def.right._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          }));
        }
      }
    };
    ZodIntersection.create = (left, right, params) => {
      return new ZodIntersection({
        left,
        right,
        typeName: ZodFirstPartyTypeKind.ZodIntersection,
        ...processCreateParams(params)
      });
    };
    ZodTuple = class _ZodTuple extends ZodType {
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.array) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.array,
            received: ctx.parsedType
          });
          return INVALID;
        }
        if (ctx.data.length < this._def.items.length) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: this._def.items.length,
            inclusive: true,
            exact: false,
            type: "array"
          });
          return INVALID;
        }
        const rest = this._def.rest;
        if (!rest && ctx.data.length > this._def.items.length) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: this._def.items.length,
            inclusive: true,
            exact: false,
            type: "array"
          });
          status.dirty();
        }
        const items = [...ctx.data].map((item, itemIndex) => {
          const schema = this._def.items[itemIndex] || this._def.rest;
          if (!schema)
            return null;
          return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
        }).filter((x) => !!x);
        if (ctx.common.async) {
          return Promise.all(items).then((results) => {
            return ParseStatus.mergeArray(status, results);
          });
        } else {
          return ParseStatus.mergeArray(status, items);
        }
      }
      get items() {
        return this._def.items;
      }
      rest(rest) {
        return new _ZodTuple({
          ...this._def,
          rest
        });
      }
    };
    ZodTuple.create = (schemas, params) => {
      if (!Array.isArray(schemas)) {
        throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
      }
      return new ZodTuple({
        items: schemas,
        typeName: ZodFirstPartyTypeKind.ZodTuple,
        rest: null,
        ...processCreateParams(params)
      });
    };
    ZodRecord = class _ZodRecord extends ZodType {
      get keySchema() {
        return this._def.keyType;
      }
      get valueSchema() {
        return this._def.valueType;
      }
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.object) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.object,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const pairs = [];
        const keyType = this._def.keyType;
        const valueType = this._def.valueType;
        for (const key in ctx.data) {
          pairs.push({
            key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
            value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
            alwaysSet: key in ctx.data
          });
        }
        if (ctx.common.async) {
          return ParseStatus.mergeObjectAsync(status, pairs);
        } else {
          return ParseStatus.mergeObjectSync(status, pairs);
        }
      }
      get element() {
        return this._def.valueType;
      }
      static create(first, second, third) {
        if (second instanceof ZodType) {
          return new _ZodRecord({
            keyType: first,
            valueType: second,
            typeName: ZodFirstPartyTypeKind.ZodRecord,
            ...processCreateParams(third)
          });
        }
        return new _ZodRecord({
          keyType: ZodString.create(),
          valueType: first,
          typeName: ZodFirstPartyTypeKind.ZodRecord,
          ...processCreateParams(second)
        });
      }
    };
    ZodMap = class extends ZodType {
      get keySchema() {
        return this._def.keyType;
      }
      get valueSchema() {
        return this._def.valueType;
      }
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.map) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.map,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const keyType = this._def.keyType;
        const valueType = this._def.valueType;
        const pairs = [...ctx.data.entries()].map(([key, value], index) => {
          return {
            key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
            value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
          };
        });
        if (ctx.common.async) {
          const finalMap = /* @__PURE__ */ new Map();
          return Promise.resolve().then(async () => {
            for (const pair of pairs) {
              const key = await pair.key;
              const value = await pair.value;
              if (key.status === "aborted" || value.status === "aborted") {
                return INVALID;
              }
              if (key.status === "dirty" || value.status === "dirty") {
                status.dirty();
              }
              finalMap.set(key.value, value.value);
            }
            return { status: status.value, value: finalMap };
          });
        } else {
          const finalMap = /* @__PURE__ */ new Map();
          for (const pair of pairs) {
            const key = pair.key;
            const value = pair.value;
            if (key.status === "aborted" || value.status === "aborted") {
              return INVALID;
            }
            if (key.status === "dirty" || value.status === "dirty") {
              status.dirty();
            }
            finalMap.set(key.value, value.value);
          }
          return { status: status.value, value: finalMap };
        }
      }
    };
    ZodMap.create = (keyType, valueType, params) => {
      return new ZodMap({
        valueType,
        keyType,
        typeName: ZodFirstPartyTypeKind.ZodMap,
        ...processCreateParams(params)
      });
    };
    ZodSet = class _ZodSet extends ZodType {
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.set) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.set,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const def = this._def;
        if (def.minSize !== null) {
          if (ctx.data.size < def.minSize.value) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: def.minSize.value,
              type: "set",
              inclusive: true,
              exact: false,
              message: def.minSize.message
            });
            status.dirty();
          }
        }
        if (def.maxSize !== null) {
          if (ctx.data.size > def.maxSize.value) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: def.maxSize.value,
              type: "set",
              inclusive: true,
              exact: false,
              message: def.maxSize.message
            });
            status.dirty();
          }
        }
        const valueType = this._def.valueType;
        function finalizeSet(elements2) {
          const parsedSet = /* @__PURE__ */ new Set();
          for (const element of elements2) {
            if (element.status === "aborted")
              return INVALID;
            if (element.status === "dirty")
              status.dirty();
            parsedSet.add(element.value);
          }
          return { status: status.value, value: parsedSet };
        }
        const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
        if (ctx.common.async) {
          return Promise.all(elements).then((elements2) => finalizeSet(elements2));
        } else {
          return finalizeSet(elements);
        }
      }
      min(minSize, message) {
        return new _ZodSet({
          ...this._def,
          minSize: { value: minSize, message: errorUtil.toString(message) }
        });
      }
      max(maxSize, message) {
        return new _ZodSet({
          ...this._def,
          maxSize: { value: maxSize, message: errorUtil.toString(message) }
        });
      }
      size(size, message) {
        return this.min(size, message).max(size, message);
      }
      nonempty(message) {
        return this.min(1, message);
      }
    };
    ZodSet.create = (valueType, params) => {
      return new ZodSet({
        valueType,
        minSize: null,
        maxSize: null,
        typeName: ZodFirstPartyTypeKind.ZodSet,
        ...processCreateParams(params)
      });
    };
    ZodFunction = class _ZodFunction extends ZodType {
      constructor() {
        super(...arguments);
        this.validate = this.implement;
      }
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.function) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.function,
            received: ctx.parsedType
          });
          return INVALID;
        }
        function makeArgsIssue(args, error) {
          return makeIssue({
            data: args,
            path: ctx.path,
            errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
            issueData: {
              code: ZodIssueCode.invalid_arguments,
              argumentsError: error
            }
          });
        }
        function makeReturnsIssue(returns, error) {
          return makeIssue({
            data: returns,
            path: ctx.path,
            errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
            issueData: {
              code: ZodIssueCode.invalid_return_type,
              returnTypeError: error
            }
          });
        }
        const params = { errorMap: ctx.common.contextualErrorMap };
        const fn = ctx.data;
        if (this._def.returns instanceof ZodPromise) {
          const me = this;
          return OK(async function(...args) {
            const error = new ZodError([]);
            const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
              error.addIssue(makeArgsIssue(args, e));
              throw error;
            });
            const result = await Reflect.apply(fn, this, parsedArgs);
            const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
              error.addIssue(makeReturnsIssue(result, e));
              throw error;
            });
            return parsedReturns;
          });
        } else {
          const me = this;
          return OK(function(...args) {
            const parsedArgs = me._def.args.safeParse(args, params);
            if (!parsedArgs.success) {
              throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
            }
            const result = Reflect.apply(fn, this, parsedArgs.data);
            const parsedReturns = me._def.returns.safeParse(result, params);
            if (!parsedReturns.success) {
              throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
            }
            return parsedReturns.data;
          });
        }
      }
      parameters() {
        return this._def.args;
      }
      returnType() {
        return this._def.returns;
      }
      args(...items) {
        return new _ZodFunction({
          ...this._def,
          args: ZodTuple.create(items).rest(ZodUnknown.create())
        });
      }
      returns(returnType) {
        return new _ZodFunction({
          ...this._def,
          returns: returnType
        });
      }
      implement(func) {
        const validatedFunc = this.parse(func);
        return validatedFunc;
      }
      strictImplement(func) {
        const validatedFunc = this.parse(func);
        return validatedFunc;
      }
      static create(args, returns, params) {
        return new _ZodFunction({
          args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
          returns: returns || ZodUnknown.create(),
          typeName: ZodFirstPartyTypeKind.ZodFunction,
          ...processCreateParams(params)
        });
      }
    };
    ZodLazy = class extends ZodType {
      get schema() {
        return this._def.getter();
      }
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        const lazySchema = this._def.getter();
        return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
      }
    };
    ZodLazy.create = (getter, params) => {
      return new ZodLazy({
        getter,
        typeName: ZodFirstPartyTypeKind.ZodLazy,
        ...processCreateParams(params)
      });
    };
    ZodLiteral = class extends ZodType {
      _parse(input) {
        if (input.data !== this._def.value) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            received: ctx.data,
            code: ZodIssueCode.invalid_literal,
            expected: this._def.value
          });
          return INVALID;
        }
        return { status: "valid", value: input.data };
      }
      get value() {
        return this._def.value;
      }
    };
    ZodLiteral.create = (value, params) => {
      return new ZodLiteral({
        value,
        typeName: ZodFirstPartyTypeKind.ZodLiteral,
        ...processCreateParams(params)
      });
    };
    ZodEnum = class _ZodEnum extends ZodType {
      _parse(input) {
        if (typeof input.data !== "string") {
          const ctx = this._getOrReturnCtx(input);
          const expectedValues = this._def.values;
          addIssueToContext(ctx, {
            expected: util.joinValues(expectedValues),
            received: ctx.parsedType,
            code: ZodIssueCode.invalid_type
          });
          return INVALID;
        }
        if (!this._cache) {
          this._cache = new Set(this._def.values);
        }
        if (!this._cache.has(input.data)) {
          const ctx = this._getOrReturnCtx(input);
          const expectedValues = this._def.values;
          addIssueToContext(ctx, {
            received: ctx.data,
            code: ZodIssueCode.invalid_enum_value,
            options: expectedValues
          });
          return INVALID;
        }
        return OK(input.data);
      }
      get options() {
        return this._def.values;
      }
      get enum() {
        const enumValues = {};
        for (const val of this._def.values) {
          enumValues[val] = val;
        }
        return enumValues;
      }
      get Values() {
        const enumValues = {};
        for (const val of this._def.values) {
          enumValues[val] = val;
        }
        return enumValues;
      }
      get Enum() {
        const enumValues = {};
        for (const val of this._def.values) {
          enumValues[val] = val;
        }
        return enumValues;
      }
      extract(values, newDef = this._def) {
        return _ZodEnum.create(values, {
          ...this._def,
          ...newDef
        });
      }
      exclude(values, newDef = this._def) {
        return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
          ...this._def,
          ...newDef
        });
      }
    };
    ZodEnum.create = createZodEnum;
    ZodNativeEnum = class extends ZodType {
      _parse(input) {
        const nativeEnumValues = util.getValidEnumValues(this._def.values);
        const ctx = this._getOrReturnCtx(input);
        if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
          const expectedValues = util.objectValues(nativeEnumValues);
          addIssueToContext(ctx, {
            expected: util.joinValues(expectedValues),
            received: ctx.parsedType,
            code: ZodIssueCode.invalid_type
          });
          return INVALID;
        }
        if (!this._cache) {
          this._cache = new Set(util.getValidEnumValues(this._def.values));
        }
        if (!this._cache.has(input.data)) {
          const expectedValues = util.objectValues(nativeEnumValues);
          addIssueToContext(ctx, {
            received: ctx.data,
            code: ZodIssueCode.invalid_enum_value,
            options: expectedValues
          });
          return INVALID;
        }
        return OK(input.data);
      }
      get enum() {
        return this._def.values;
      }
    };
    ZodNativeEnum.create = (values, params) => {
      return new ZodNativeEnum({
        values,
        typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
        ...processCreateParams(params)
      });
    };
    ZodPromise = class extends ZodType {
      unwrap() {
        return this._def.type;
      }
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.promise,
            received: ctx.parsedType
          });
          return INVALID;
        }
        const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
        return OK(promisified.then((data) => {
          return this._def.type.parseAsync(data, {
            path: ctx.path,
            errorMap: ctx.common.contextualErrorMap
          });
        }));
      }
    };
    ZodPromise.create = (schema, params) => {
      return new ZodPromise({
        type: schema,
        typeName: ZodFirstPartyTypeKind.ZodPromise,
        ...processCreateParams(params)
      });
    };
    ZodEffects = class extends ZodType {
      innerType() {
        return this._def.schema;
      }
      sourceType() {
        return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
      }
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        const effect = this._def.effect || null;
        const checkCtx = {
          addIssue: (arg) => {
            addIssueToContext(ctx, arg);
            if (arg.fatal) {
              status.abort();
            } else {
              status.dirty();
            }
          },
          get path() {
            return ctx.path;
          }
        };
        checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
        if (effect.type === "preprocess") {
          const processed = effect.transform(ctx.data, checkCtx);
          if (ctx.common.async) {
            return Promise.resolve(processed).then(async (processed2) => {
              if (status.value === "aborted")
                return INVALID;
              const result = await this._def.schema._parseAsync({
                data: processed2,
                path: ctx.path,
                parent: ctx
              });
              if (result.status === "aborted")
                return INVALID;
              if (result.status === "dirty")
                return DIRTY(result.value);
              if (status.value === "dirty")
                return DIRTY(result.value);
              return result;
            });
          } else {
            if (status.value === "aborted")
              return INVALID;
            const result = this._def.schema._parseSync({
              data: processed,
              path: ctx.path,
              parent: ctx
            });
            if (result.status === "aborted")
              return INVALID;
            if (result.status === "dirty")
              return DIRTY(result.value);
            if (status.value === "dirty")
              return DIRTY(result.value);
            return result;
          }
        }
        if (effect.type === "refinement") {
          const executeRefinement = (acc) => {
            const result = effect.refinement(acc, checkCtx);
            if (ctx.common.async) {
              return Promise.resolve(result);
            }
            if (result instanceof Promise) {
              throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
            }
            return acc;
          };
          if (ctx.common.async === false) {
            const inner = this._def.schema._parseSync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            });
            if (inner.status === "aborted")
              return INVALID;
            if (inner.status === "dirty")
              status.dirty();
            executeRefinement(inner.value);
            return { status: status.value, value: inner.value };
          } else {
            return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
              if (inner.status === "aborted")
                return INVALID;
              if (inner.status === "dirty")
                status.dirty();
              return executeRefinement(inner.value).then(() => {
                return { status: status.value, value: inner.value };
              });
            });
          }
        }
        if (effect.type === "transform") {
          if (ctx.common.async === false) {
            const base2 = this._def.schema._parseSync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            });
            if (!isValid(base2))
              return INVALID;
            const result = effect.transform(base2.value, checkCtx);
            if (result instanceof Promise) {
              throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
            }
            return { status: status.value, value: result };
          } else {
            return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base2) => {
              if (!isValid(base2))
                return INVALID;
              return Promise.resolve(effect.transform(base2.value, checkCtx)).then((result) => ({
                status: status.value,
                value: result
              }));
            });
          }
        }
        util.assertNever(effect);
      }
    };
    ZodEffects.create = (schema, effect, params) => {
      return new ZodEffects({
        schema,
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        effect,
        ...processCreateParams(params)
      });
    };
    ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
      return new ZodEffects({
        schema,
        effect: { type: "preprocess", transform: preprocess },
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        ...processCreateParams(params)
      });
    };
    ZodOptional = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType === ZodParsedType.undefined) {
          return OK(void 0);
        }
        return this._def.innerType._parse(input);
      }
      unwrap() {
        return this._def.innerType;
      }
    };
    ZodOptional.create = (type, params) => {
      return new ZodOptional({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodOptional,
        ...processCreateParams(params)
      });
    };
    ZodNullable = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType === ZodParsedType.null) {
          return OK(null);
        }
        return this._def.innerType._parse(input);
      }
      unwrap() {
        return this._def.innerType;
      }
    };
    ZodNullable.create = (type, params) => {
      return new ZodNullable({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodNullable,
        ...processCreateParams(params)
      });
    };
    ZodDefault = class extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        let data = ctx.data;
        if (ctx.parsedType === ZodParsedType.undefined) {
          data = this._def.defaultValue();
        }
        return this._def.innerType._parse({
          data,
          path: ctx.path,
          parent: ctx
        });
      }
      removeDefault() {
        return this._def.innerType;
      }
    };
    ZodDefault.create = (type, params) => {
      return new ZodDefault({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodDefault,
        defaultValue: typeof params.default === "function" ? params.default : () => params.default,
        ...processCreateParams(params)
      });
    };
    ZodCatch = class extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        const newCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          }
        };
        const result = this._def.innerType._parse({
          data: newCtx.data,
          path: newCtx.path,
          parent: {
            ...newCtx
          }
        });
        if (isAsync(result)) {
          return result.then((result2) => {
            return {
              status: "valid",
              value: result2.status === "valid" ? result2.value : this._def.catchValue({
                get error() {
                  return new ZodError(newCtx.common.issues);
                },
                input: newCtx.data
              })
            };
          });
        } else {
          return {
            status: "valid",
            value: result.status === "valid" ? result.value : this._def.catchValue({
              get error() {
                return new ZodError(newCtx.common.issues);
              },
              input: newCtx.data
            })
          };
        }
      }
      removeCatch() {
        return this._def.innerType;
      }
    };
    ZodCatch.create = (type, params) => {
      return new ZodCatch({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodCatch,
        catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
        ...processCreateParams(params)
      });
    };
    ZodNaN = class extends ZodType {
      _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.nan) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.nan,
            received: ctx.parsedType
          });
          return INVALID;
        }
        return { status: "valid", value: input.data };
      }
    };
    ZodNaN.create = (params) => {
      return new ZodNaN({
        typeName: ZodFirstPartyTypeKind.ZodNaN,
        ...processCreateParams(params)
      });
    };
    BRAND = /* @__PURE__ */ Symbol("zod_brand");
    ZodBranded = class extends ZodType {
      _parse(input) {
        const { ctx } = this._processInputParams(input);
        const data = ctx.data;
        return this._def.type._parse({
          data,
          path: ctx.path,
          parent: ctx
        });
      }
      unwrap() {
        return this._def.type;
      }
    };
    ZodPipeline = class _ZodPipeline extends ZodType {
      _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.common.async) {
          const handleAsync = async () => {
            const inResult = await this._def.in._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: ctx
            });
            if (inResult.status === "aborted")
              return INVALID;
            if (inResult.status === "dirty") {
              status.dirty();
              return DIRTY(inResult.value);
            } else {
              return this._def.out._parseAsync({
                data: inResult.value,
                path: ctx.path,
                parent: ctx
              });
            }
          };
          return handleAsync();
        } else {
          const inResult = this._def.in._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inResult.status === "aborted")
            return INVALID;
          if (inResult.status === "dirty") {
            status.dirty();
            return {
              status: "dirty",
              value: inResult.value
            };
          } else {
            return this._def.out._parseSync({
              data: inResult.value,
              path: ctx.path,
              parent: ctx
            });
          }
        }
      }
      static create(a, b) {
        return new _ZodPipeline({
          in: a,
          out: b,
          typeName: ZodFirstPartyTypeKind.ZodPipeline
        });
      }
    };
    ZodReadonly = class extends ZodType {
      _parse(input) {
        const result = this._def.innerType._parse(input);
        const freeze = (data) => {
          if (isValid(data)) {
            data.value = Object.freeze(data.value);
          }
          return data;
        };
        return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
      }
      unwrap() {
        return this._def.innerType;
      }
    };
    ZodReadonly.create = (type, params) => {
      return new ZodReadonly({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodReadonly,
        ...processCreateParams(params)
      });
    };
    late = {
      object: ZodObject.lazycreate
    };
    (function(ZodFirstPartyTypeKind2) {
      ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
      ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
      ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
      ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
      ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
      ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
      ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
      ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
      ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
      ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
      ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
      ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
      ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
      ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
      ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
      ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
      ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
      ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
      ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
      ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
      ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
      ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
      ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
      ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
      ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
      ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
      ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
      ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
      ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
      ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
      ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
      ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
      ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
      ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
      ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
      ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
    })(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
    instanceOfType = (cls, params = {
      message: `Input not instance of ${cls.name}`
    }) => custom((data) => data instanceof cls, params);
    stringType = ZodString.create;
    numberType = ZodNumber.create;
    nanType = ZodNaN.create;
    bigIntType = ZodBigInt.create;
    booleanType = ZodBoolean.create;
    dateType = ZodDate.create;
    symbolType = ZodSymbol.create;
    undefinedType = ZodUndefined.create;
    nullType = ZodNull.create;
    anyType = ZodAny.create;
    unknownType = ZodUnknown.create;
    neverType = ZodNever.create;
    voidType = ZodVoid.create;
    arrayType = ZodArray.create;
    objectType = ZodObject.create;
    strictObjectType = ZodObject.strictCreate;
    unionType = ZodUnion.create;
    discriminatedUnionType = ZodDiscriminatedUnion.create;
    intersectionType = ZodIntersection.create;
    tupleType = ZodTuple.create;
    recordType = ZodRecord.create;
    mapType = ZodMap.create;
    setType = ZodSet.create;
    functionType = ZodFunction.create;
    lazyType = ZodLazy.create;
    literalType = ZodLiteral.create;
    enumType = ZodEnum.create;
    nativeEnumType = ZodNativeEnum.create;
    promiseType = ZodPromise.create;
    effectsType = ZodEffects.create;
    optionalType = ZodOptional.create;
    nullableType = ZodNullable.create;
    preprocessType = ZodEffects.createWithPreprocess;
    pipelineType = ZodPipeline.create;
    ostring = () => stringType().optional();
    onumber = () => numberType().optional();
    oboolean = () => booleanType().optional();
    coerce = {
      string: ((arg) => ZodString.create({ ...arg, coerce: true })),
      number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
      boolean: ((arg) => ZodBoolean.create({
        ...arg,
        coerce: true
      })),
      bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
      date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
    };
    NEVER = INVALID;
  }
});

// node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});
var init_external = __esm({
  "node_modules/zod/v3/external.js"() {
    init_errors2();
    init_parseUtil();
    init_typeAliases();
    init_util();
    init_types();
    init_ZodError();
  }
});

// node_modules/zod/index.js
var init_zod = __esm({
  "node_modules/zod/index.js"() {
    init_external();
    init_external();
  }
});

// src/model/common.ts
var ID_PATTERNS, zGoalId, zDesignId, zTaskId, zFactId, zClaimId, zLegacyClaimId, zDecisionId, zModuleId, zScopeId, zIceboxId, zIsoDate, zHandle, zNonEmpty, zGlob, zExpect, zProbe, zScoreValue;
var init_common = __esm({
  "src/model/common.ts"() {
    "use strict";
    init_zod();
    ID_PATTERNS = {
      goal: /^G-\d{3,}$/,
      design: /^D-\d{3,}$/,
      task: /^T-\d{3,}$/,
      fact: /^F-[A-Z0-9]+-\d{3,}$/,
      claim: /^C-\d{3,}$/,
      legacyClaim: /^LC-\d{3,}$/,
      decision: /^DEC-\d{3,}$/,
      /**
       * Khối trong sơ đồ. Thay cho `Zone` cũ: một khối vừa là vùng code (có `paths`)
       * vừa là node có contract và bộ verify — không cần hai bản đồ song song.
       */
      module: /^M-[a-z0-9][a-z0-9-]*$/,
      /** Phạm vi công việc = đơn vị bàn giao có ranh giới code và người nghiệm thu. */
      scope: /^P-[a-z0-9][a-z0-9-]*$/,
      /** Icebox = việc đã quyết CHƯA làm. Xem docstring đầu `src/model/icebox.ts`. */
      icebox: /^ICE-\d{3,}$/
    };
    zGoalId = external_exports.string().regex(ID_PATTERNS.goal, "ID goal ph\u1EA3i d\u1EA1ng G-001");
    zDesignId = external_exports.string().regex(ID_PATTERNS.design, "ID design ph\u1EA3i d\u1EA1ng D-001");
    zTaskId = external_exports.string().regex(ID_PATTERNS.task, "ID task ph\u1EA3i d\u1EA1ng T-001");
    zFactId = external_exports.string().regex(ID_PATTERNS.fact, "ID fact ph\u1EA3i d\u1EA1ng F-ACC-007");
    zClaimId = external_exports.string().regex(ID_PATTERNS.claim, "ID claim ph\u1EA3i d\u1EA1ng C-031");
    zLegacyClaimId = external_exports.string().regex(ID_PATTERNS.legacyClaim, "ID legacy claim ph\u1EA3i d\u1EA1ng LC-007");
    zDecisionId = external_exports.string().regex(ID_PATTERNS.decision, "ID decision ph\u1EA3i d\u1EA1ng DEC-004");
    zModuleId = external_exports.string().regex(ID_PATTERNS.module, "ID kh\u1ED1i ph\u1EA3i d\u1EA1ng M-intent");
    zScopeId = external_exports.string().regex(ID_PATTERNS.scope, "ID ph\u1EA1m vi ph\u1EA3i d\u1EA1ng P-chat-core");
    zIceboxId = external_exports.string().regex(ID_PATTERNS.icebox, "ID icebox ph\u1EA3i d\u1EA1ng ICE-001");
    zIsoDate = external_exports.string().min(1).refine((s) => !Number.isNaN(Date.parse(s)), "ph\u1EA3i l\xE0 ng\xE0y ISO 8601 h\u1EE3p l\u1EC7");
    zHandle = external_exports.string().regex(/^@[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'handle ph\u1EA3i d\u1EA1ng "@ten-nguoi"');
    zNonEmpty = external_exports.string().trim().min(1, "kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng");
    zGlob = external_exports.string().trim().min(1);
    zExpect = external_exports.union([
      external_exports.literal("exit_zero"),
      external_exports.object({
        exit_code: external_exports.number().int().optional(),
        stdout_contains: external_exports.string().optional(),
        stdout_matches: external_exports.string().optional(),
        stderr_contains: external_exports.string().optional()
      })
    ]).default("exit_zero");
    zProbe = external_exports.object({
      run: zNonEmpty.describe("l\u1EC7nh shell ch\u1EA1y \u0111\u01B0\u1EE3c, kh\xF4ng t\u01B0\u01A1ng t\xE1c"),
      expect: zExpect,
      /**
       * Lệnh thoát 0 ⇒ bỏ qua, đánh dấu `unavailable`, **KHÔNG phải `failing`**.
       * Dùng cho probe cần môi trường ngoài (DB, service, mạng nội bộ).
       */
      skip_if: external_exports.string().optional(),
      timeout_ms: external_exports.number().int().positive().max(6e5).optional(),
      cwd: external_exports.string().optional()
    }).strict();
    zScoreValue = external_exports.union([
      external_exports.literal(1),
      external_exports.literal(2),
      external_exports.literal(3),
      external_exports.literal(4),
      external_exports.literal(5)
    ]);
  }
});

// src/model/anchor.ts
function parseAnchorString(raw) {
  const s = raw.trim();
  if (!s) return null;
  const commit = COMMIT.exec(s);
  if (commit?.groups) return { kind: "commit", sha: commit.groups["sha"] };
  const hash = FILE_HASH_RANGE.exec(s);
  if (hash?.groups) {
    const line = Number(hash.groups["line"]);
    const end = hash.groups["end"] ? Number(hash.groups["end"]) : void 0;
    return end === void 0 ? { kind: "file", path: hash.groups["path"], line } : { kind: "file", path: hash.groups["path"], line, line_end: end };
  }
  const colon = FILE_COLON.exec(s);
  if (colon?.groups) {
    const line = Number(colon.groups["line"]);
    const end = colon.groups["end"] ? Number(colon.groups["end"]) : void 0;
    return end === void 0 ? { kind: "file", path: colon.groups["path"], line } : { kind: "file", path: colon.groups["path"], line, line_end: end };
  }
  if (/^https?:\/\//.test(s)) return null;
  if (!s.includes(" ")) return { kind: "file", path: s };
  return null;
}
function formatAnchor(a) {
  switch (a.kind) {
    case "file":
      if (a.line === void 0) return a.path;
      return a.line_end === void 0 ? `${a.path}:${a.line}` : `${a.path}:${a.line}-${a.line_end}`;
    case "commit":
      return `commit:${a.sha.slice(0, 8)}`;
    case "url":
      return `${a.url} (l\u1EA5y ${a.fetched_at.slice(0, 10)})`;
    case "human":
      return `${a.by} ${a.at.slice(0, 10)}${a.link ? ` \u2014 ${a.link}` : ""}`;
  }
}
var zFileAnchor, zCommitAnchor, zUrlAnchor, zHumanAnchor, zAnchorObject, FILE_HASH_RANGE, FILE_COLON, COMMIT, zAnchor, NEED_ANCHOR, zAnchors;
var init_anchor = __esm({
  "src/model/anchor.ts"() {
    "use strict";
    init_zod();
    init_common();
    zFileAnchor = external_exports.object({
      kind: external_exports.literal("file"),
      path: zNonEmpty,
      /** Dòng bắt đầu, 1-indexed. Thiếu = neo vào cả file. */
      line: external_exports.number().int().positive().optional(),
      line_end: external_exports.number().int().positive().optional()
    });
    zCommitAnchor = external_exports.object({
      kind: external_exports.literal("commit"),
      sha: external_exports.string().regex(/^[0-9a-f]{7,40}$/, "sha ph\u1EA3i l\xE0 hex 7\u201340 k\xFD t\u1EF1"),
      note: external_exports.string().optional()
    });
    zUrlAnchor = external_exports.object({
      kind: external_exports.literal("url"),
      url: external_exports.string().url(),
      /** Bắt buộc: web đổi. Một URL không có mốc thời gian lấy về thì không neo được gì. */
      fetched_at: zIsoDate,
      quote: external_exports.string().optional()
    });
    zHumanAnchor = external_exports.object({
      kind: external_exports.literal("human"),
      by: zHandle,
      at: zIsoDate,
      /** Link tới ticket/biên bản/chat — để người sau truy lại được. */
      link: external_exports.string().optional()
    });
    zAnchorObject = external_exports.discriminatedUnion("kind", [
      zFileAnchor,
      zCommitAnchor,
      zUrlAnchor,
      zHumanAnchor
    ]);
    FILE_HASH_RANGE = /^(?<path>[^#\s]+)#L(?<line>\d+)(?:-L?(?<end>\d+))?$/;
    FILE_COLON = /^(?<path>[^:\s]+):(?<line>\d+)(?::(?<end>\d+))?$/;
    COMMIT = /^commit:(?<sha>[0-9a-f]{7,40})$/;
    zAnchor = external_exports.union([external_exports.string(), zAnchorObject]).transform((v, ctx) => {
      if (typeof v !== "string") return v;
      const parsed = parseAnchorString(v);
      if (!parsed) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          message: `anchor "${v}" kh\xF4ng nh\u1EADn d\u1EA1ng \u0111\u01B0\u1EE3c. D\xF9ng "src/a.ts#L12", "src/a.ts:12", "commit:abc1234", ho\u1EB7c d\u1EA1ng object cho url/human (url c\u1EA7n fetched_at).`
        });
        return external_exports.NEVER;
      }
      return parsed;
    });
    NEED_ANCHOR = "ph\u1EA3i c\xF3 `anchors` \u2014 b\u1EB1ng ch\u1EE9ng cho ph\xE1t bi\u1EC3u n\xE0y. D\xF9ng `src/a.ts#L42`, `commit:abc1234`, ho\u1EB7c d\u1EA1ng object cho URL (k\xE8m `fetched_at`) / ng\u01B0\u1EDDi (`kind: human`). Kh\xF4ng ch\u1EC9 ra \u0111\u01B0\u1EE3c ngu\u1ED3n th\xEC \u0111\u1EEBng ghi: \u0111\u01B0a v\xE0o `open_questions` c\u1EE7a task thay v\xEC \u0111\u01B0a v\xE0o kho tri th\u1EE9c.";
    zAnchors = external_exports.array(zAnchor, { required_error: NEED_ANCHOR, invalid_type_error: NEED_ANCHOR }).min(1, NEED_ANCHOR);
  }
});

// src/model/config.ts
function canDispatchSubagent(harness) {
  return harness === "claude-code";
}
function agentModelAlias(modelId) {
  return /(opus|sonnet|haiku|fable)/i.exec(modelId)?.[1]?.toLowerCase();
}
function enforcementFor(config, rule) {
  return config.enforcement_rules[rule] ?? config.enforcement;
}
var ENFORCEMENT, ENFORCEMENT_RULES, MODEL_TIER, HARNESS, LATEST_SCHEMA_VERSION, zConfig;
var init_config = __esm({
  "src/model/config.ts"() {
    "use strict";
    init_zod();
    init_common();
    ENFORCEMENT = ["warn", "enforce"];
    ENFORCEMENT_RULES = [
      /** Ghi tri thức không có anchor. */
      "knowledge_anchor",
      /** Ghi file .ganas/ sai schema. */
      "schema",
      /** Kết thúc phiên khi exit_contract chưa thoả. */
      "exit_contract",
      /** Tạo/đóng task không neo được vào phạm vi/goal. */
      "task_link"
    ];
    MODEL_TIER = ["main", "verifier", "scribe"];
    HARNESS = ["claude-code", "cursor", "zed", "windsurf", "other"];
    LATEST_SCHEMA_VERSION = 1;
    zConfig = external_exports.object({
      version: external_exports.literal(LATEST_SCHEMA_VERSION).default(LATEST_SCHEMA_VERSION).describe("phi\xEAn b\u1EA3n schema .ganas/"),
      project: zNonEmpty,
      /**
       * Harness giao việc. Mặc định `claude-code`: đó là harness ganas cưỡng chế
       * được đầy đủ (hook + skill), và là mặc định của `ganas init`. Dự án cũ
       * không khai field này vẫn chạy như trước.
       */
      harness: external_exports.enum(HARNESS).default("claude-code"),
      /** Mức mặc định cho mọi luật. */
      enforcement: external_exports.enum(ENFORCEMENT).default("warn"),
      /** Ghi đè theo từng luật. Thiếu key ⇒ dùng `enforcement`. */
      enforcement_rules: external_exports.record(external_exports.enum(ENFORCEMENT_RULES), external_exports.enum(ENFORCEMENT)).default({}),
      /** Ba key phải khớp đúng `MODEL_TIER` — `Task.model` tham chiếu vào đây. */
      models: external_exports.object({
        main: external_exports.string().default("claude-opus-5"),
        verifier: external_exports.string().default("claude-sonnet-5"),
        scribe: external_exports.string().default("claude-haiku-4-5")
      }).default({}),
      session_start: external_exports.object({
        /**
         * Tự gửi một câu mở đầu khi phiên bắt đầu (hook trả `initialUserMessage`).
         * Mặc định tắt: người mở Claude Code để hỏi nhanh một câu không muốn bị
         * cuốn ngay vào task. Brief vẫn được bơm vào context dù bật hay tắt.
         */
        auto_begin: external_exports.boolean().default(false)
      }).default({}),
      claim: external_exports.object({
        /**
         * Một task bị giữ (claim) quá lâu không còn tin được là phiên đó vẫn
         * sống — có thể đã crash. Sau ngần này phút, claim cũ bị coi là bỏ
         * hoang và một phiên khác được phép giành lại. Xem `graph/claim.ts`.
         */
        ttl_minutes: external_exports.number().int().positive().default(240)
      }).default({})
    });
  }
});

// src/model/design.ts
var DESIGN_STATUS, zDesign;
var init_design = __esm({
  "src/model/design.ts"() {
    "use strict";
    init_zod();
    init_common();
    DESIGN_STATUS = ["draft", "active", "superseded", "archived"];
    zDesign = external_exports.object({
      id: zDesignId,
      title: zNonEmpty,
      serves: external_exports.array(zGoalId, {
        required_error: "design ph\u1EA3i khai `serves` \u2014 n\xF3 ph\u1EE5c v\u1EE5 goal n\xE0o? Kh\xF4ng c\xF3 goal th\xEC kh\xF4ng c\u1EA7n design.",
        invalid_type_error: "`serves` ph\u1EA3i l\xE0 danh s\xE1ch ID goal, vd:\n  serves:\n    - G-001"
      }).min(
        1,
        "design ph\u1EA3i khai `serves` \u2014 n\xF3 ph\u1EE5c v\u1EE5 goal n\xE0o? Kh\xF4ng c\xF3 goal th\xEC kh\xF4ng c\u1EA7n design."
      ),
      summary: zNonEmpty.describe("m\u1ED9t \u0111o\u1EA1n: c\xE1ch ti\u1EBFp c\u1EADn v\xE0 v\xEC sao ch\u1ECDn n\xF3"),
      status: external_exports.enum(DESIGN_STATUS).default("draft"),
      /** Các quyết định người đã chốt mà design này dựa vào. */
      decisions: external_exports.array(zDecisionId).default([]),
      supersedes: external_exports.array(zDesignId).default([]),
      created_at: zIsoDate.optional(),
      notes: external_exports.string().optional()
    }).strict().superRefine((d, ctx) => {
      const dup = d.serves.find((g, i) => d.serves.indexOf(g) !== i);
      if (dup) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["serves"],
          message: `design ${d.id} li\u1EC7t k\xEA goal ${dup} hai l\u1EA7n`
        });
      }
      if (d.supersedes.includes(d.id)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["supersedes"],
          message: `design ${d.id} kh\xF4ng th\u1EC3 thay th\u1EBF ch\xEDnh n\xF3`
        });
      }
    });
  }
});

// src/model/goal.ts
var zAcceptanceCommand, zAcceptanceManual, zAcceptance, GOAL_STATUS, zGoal;
var init_goal = __esm({
  "src/model/goal.ts"() {
    "use strict";
    init_zod();
    init_common();
    zAcceptanceCommand = external_exports.object({
      id: zNonEmpty,
      kind: external_exports.literal("command"),
      run: zNonEmpty.describe("l\u1EC7nh shell ch\u1EA1y \u0111\u01B0\u1EE3c, kh\xF4ng t\u01B0\u01A1ng t\xE1c"),
      expect: zExpect
    });
    zAcceptanceManual = external_exports.object({
      id: zNonEmpty,
      kind: external_exports.literal("manual"),
      check: zNonEmpty.describe("\u0111i\u1EC1u ng\u01B0\u1EDDi ph\u1EA3i x\xE1c nh\u1EADn, vi\u1EBFt \u0111\u1EE7 c\u1EE5 th\u1EC3 \u0111\u1EC3 tr\u1EA3 l\u1EDDi c\xF3/kh\xF4ng"),
      /** Bắt buộc: tiêu chí thủ công không có người ký thì không ai nghiệm thu. */
      owner: zHandle
    });
    zAcceptance = external_exports.discriminatedUnion("kind", [zAcceptanceCommand, zAcceptanceManual]);
    GOAL_STATUS = ["draft", "active", "closed"];
    zGoal = external_exports.object({
      id: zGoalId,
      title: zNonEmpty,
      /** Kết quả người dùng cảm nhận được, không phải việc phải làm. */
      outcome: zNonEmpty,
      acceptance: external_exports.array(zAcceptance, {
        required_error: "goal ph\u1EA3i c\xF3 `acceptance` \u2014 l\xE0m sao bi\u1EBFt m\u1EE5c ti\xEAu \u0111\xE3 \u0111\u1EA1t? Kh\xF4ng \u0111o \u0111\u01B0\u1EE3c th\xEC \u0111\xF3 l\xE0 nguy\u1EC7n v\u1ECDng, kh\xF4ng ph\u1EA3i m\u1EE5c ti\xEAu."
      }).min(
        1,
        "goal ph\u1EA3i c\xF3 \xEDt nh\u1EA5t m\u1ED9t ti\xEAu ch\xED nghi\u1EC7m thu \u2014 kh\xF4ng \u0111o \u0111\u01B0\u1EE3c th\xEC kh\xF4ng bao gi\u1EDD \u0111\xF3ng \u0111\u01B0\u1EE3c"
      ),
      status: external_exports.enum(GOAL_STATUS).default("draft"),
      /** Chữ ký người. Model không được tự đặt mục tiêu — xem luật trong plan. */
      approved_by: zHandle.optional(),
      approved_at: zIsoDate.optional(),
      created_at: zIsoDate.optional(),
      closed_at: zIsoDate.optional(),
      notes: external_exports.string().optional()
    }).strict().superRefine((g, ctx) => {
      if (g.status === "active" && !g.approved_by) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["approved_by"],
          message: `goal ${g.id} \u1EDF tr\u1EA1ng th\xE1i "active" nh\u01B0ng ch\u01B0a c\xF3 approved_by. M\u1EE5c ti\xEAu ph\u1EA3i do ng\u01B0\u1EDDi ch\u1ED1t, kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 model t\u1EF1 \u0111\u1EB7t. Gi\u1EEF \u1EDF "draft" cho t\u1EDBi khi c\xF3 ng\u01B0\u1EDDi duy\u1EC7t.`
        });
      }
      if (g.approved_by && !g.approved_at) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["approved_at"],
          message: `goal ${g.id} c\xF3 approved_by nh\u01B0ng thi\u1EBFu approved_at`
        });
      }
      const ids = g.acceptance.map((a) => a.id);
      const dup = ids.find((id, i) => ids.indexOf(id) !== i);
      if (dup) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["acceptance"],
          message: `goal ${g.id} c\xF3 ti\xEAu ch\xED nghi\u1EC7m thu tr\xF9ng id "${dup}"`
        });
      }
    });
  }
});

// src/model/knowledge.ts
function freshnessOf({ fact, depsChangedAt, now = Date.now() }) {
  if (!fact.last_verified_at) return "never_verified";
  if (fact.last_result === "fail") return "failing";
  const verifiedAt = Date.parse(fact.last_verified_at);
  if (Number.isNaN(verifiedAt)) return "never_verified";
  if (depsChangedAt !== void 0 && depsChangedAt > verifiedAt) return "stale";
  if (fact.ttl_days > 0 && now - verifiedAt > fact.ttl_days * 864e5) return "stale";
  return "fresh";
}
var VERIFY_RESULT, CLOCK_SKEW_MS, zFact, PROVENANCE, TRUST, zClaim, zDecision;
var init_knowledge = __esm({
  "src/model/knowledge.ts"() {
    "use strict";
    init_zod();
    init_anchor();
    init_common();
    VERIFY_RESULT = ["pass", "fail", "unknown"];
    CLOCK_SKEW_MS = 5 * 6e4;
    zFact = external_exports.object({
      id: zFactId,
      statement: zNonEmpty,
      /**
       * Phạm vi mà phát biểu này đúng. Bắt buộc, và KHÔNG suy tự động từ
       * `depends_on` ∩ `module.paths`: fact không có `depends_on` sẽ mất phạm vi,
       * fact chạm hai khối sẽ có hai phạm vi — đúng thứ mush cần tránh. Công cụ
       * chỉ GỢI Ý (`ganas scope assign`), người quyết.
       */
      scope: zScopeId,
      verify: zProbe,
      /** Glob các file mà fact này phụ thuộc. Đổi file ⇒ fact thành STALE. */
      depends_on: external_exports.array(zGlob).default([]),
      /** Hết hạn theo thời gian, kể cả khi không file nào đổi. 0 = không hết hạn. */
      ttl_days: external_exports.number().int().min(0).default(0),
      last_verified_at: zIsoDate.optional(),
      verified_by: external_exports.string().optional().describe("session id ho\u1EB7c @handle"),
      last_result: external_exports.enum(VERIFY_RESULT).default("unknown"),
      anchors: external_exports.array(zAnchor).default([]),
      /** Nếu fact này được thăng cấp từ một claim kế thừa, giữ lại vết. */
      promoted_from: external_exports.union([zClaimId, zLegacyClaimId]).optional(),
      notes: external_exports.string().optional()
    }).strict().superRefine((f, ctx) => {
      if (f.last_verified_at) {
        const t = Date.parse(f.last_verified_at);
        if (t > Date.now() + CLOCK_SKEW_MS) {
          ctx.addIssue({
            code: external_exports.ZodIssueCode.custom,
            path: ["last_verified_at"],
            message: `fact ${f.id} c\xF3 last_verified_at \u1EDF t\u01B0\u01A1ng lai (${f.last_verified_at}). Ch\u1EC9 \u0111\u1EB7t tr\u01B0\u1EDDng n\xE0y b\u1EB1ng c\xE1ch ch\u1EA1y \`ganas verify\` th\u1EADt, kh\xF4ng \u0111i\u1EC1n tay.`
          });
        }
      }
      if (f.last_result !== "unknown" && !f.last_verified_at) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["last_result"],
          message: `fact ${f.id} khai last_result="${f.last_result}" nh\u01B0ng kh\xF4ng c\xF3 last_verified_at`
        });
      }
    });
    PROVENANCE = ["session", "human", "imported"];
    TRUST = ["unverified", "confirmed", "refuted", "unprovable"];
    zClaim = external_exports.object({
      id: external_exports.union([zClaimId, zLegacyClaimId]),
      statement: zNonEmpty,
      /** Phạm vi mà giả thuyết này nói về. Bắt buộc, như fact. */
      scope: zScopeId,
      anchors: zAnchors,
      provenance: external_exports.enum(PROVENANCE),
      trust: external_exports.enum(TRUST).default("unverified"),
      /** Phiên nào sinh ra claim này (nếu do phiên ghi). */
      source_session: external_exports.string().optional(),
      /** Kết quả đối chất: probe đã sinh ra, và vì sao kết luận vậy. */
      verdict: external_exports.object({
        at: zIsoDate,
        probe: zProbe.optional(),
        evidence: zNonEmpty.describe("b\u1EB1ng ch\u1EE9ng d\u1EABn t\u1EDBi k\u1EBFt lu\u1EADn, c\xF3 anchor"),
        /** Fact được tạo ra nếu claim này confirmed. */
        promoted_to: zFactId.optional()
      }).optional(),
      notes: external_exports.string().optional()
    }).strict().superRefine((c, ctx) => {
      const isLegacy = c.id.startsWith("LC-");
      if (isLegacy && c.provenance !== "imported") {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["provenance"],
          message: `claim ${c.id} d\xF9ng ti\u1EC1n t\u1ED1 LC- n\xEAn provenance ph\u1EA3i l\xE0 "imported"`
        });
      }
      if (!isLegacy && c.provenance === "imported") {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["id"],
          message: `claim import t\u1EEB t\xE0i li\u1EC7u c\u0169 ph\u1EA3i d\xF9ng ti\u1EC1n t\u1ED1 LC- (hi\u1EC7n l\xE0 ${c.id})`
        });
      }
      if (c.trust !== "unverified" && !c.verdict) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["verdict"],
          message: `claim ${c.id} c\xF3 trust="${c.trust}" nh\u01B0ng thi\u1EBFu verdict. \u0110\u1ED5i m\u1EE9c tin c\u1EADy ph\u1EA3i k\xE8m b\u1EB1ng ch\u1EE9ng, kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1ED5i tr\u1EA7n.`
        });
      }
      if (c.verdict?.promoted_to && c.trust !== "confirmed") {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["verdict", "promoted_to"],
          message: `claim ${c.id} ch\u1EC9 \u0111\u01B0\u1EE3c th\u0103ng c\u1EA5p th\xE0nh fact khi trust="confirmed"`
        });
      }
    });
    zDecision = external_exports.object({
      id: zDecisionId,
      statement: zNonEmpty,
      /**
       * Phạm vi áp dụng. **Tuỳ chọn, thiếu = áp cho toàn dự án** — ngược với
       * fact/claim, và có lý do: fact ngoài phạm vi mà được tin ⇒ ảo giác; còn
       * decision bị thu hẹp nhầm ⇒ model vi phạm một ràng buộc người đã chốt,
       * tệ hơn. Mặc định an toàn của mỗi loại nằm ở hai phía đối nhau.
       */
      scope: zScopeId.optional(),
      /** Bắt buộc. Không có người ký thì không phải quyết định. */
      decided_by: zHandle,
      decided_at: zIsoDate,
      link: external_exports.string().optional().describe("ticket / bi\xEAn b\u1EA3n / link chat"),
      /** Điều gì buộc phải chọn — bối cảnh, ràng buộc, lựa chọn khác đã cân nhắc. */
      context: external_exports.string().optional(),
      /** Phải sống với gì sau khi chọn — đánh đổi, rủi ro chấp nhận, việc kéo theo. */
      consequence: external_exports.string().optional(),
      supersedes: external_exports.array(zDecisionId).default([]),
      notes: external_exports.string().optional()
    }).strict();
  }
});

// src/model/icebox.ts
var ICEBOX_STATUS, zIcebox;
var init_icebox = __esm({
  "src/model/icebox.ts"() {
    "use strict";
    init_zod();
    init_anchor();
    init_common();
    init_knowledge();
    ICEBOX_STATUS = ["open", "closed", "promoted"];
    zIcebox = external_exports.object({
      id: zIceboxId,
      title: zNonEmpty,
      /** Thời điểm phát hiện. KHÔNG default `now` — lệnh `add` sẽ điền. */
      found_at: zIsoDate,
      /**
       * Per-record, không per-project: "sửa kiến trúc khi rảnh" và "kiểm lại
       * sau sprint" là hai chân trời khác nhau. Cùng khuôn `Fact.ttl_days`.
       */
      review_after_days: external_exports.number().int().min(1).default(30),
      /** Quan trọng đến đâu nếu bỏ qua. Cùng thang với `DebtScore.weight`. */
      weight: zScoreValue,
      /** Dễ sửa đến đâu. Cùng thang với `DebtScore.ease`. */
      ease: zScoreValue,
      /**
       * Lý do hoãn, bắt buộc, không rỗng. Trường giữ sổ này trung thực — sáu
       * tháng sau không ai biết lý do hoãn còn đúng không nếu không ghi. Đây là
       * thứ phân biệt "hoãn có ý thức" với "quên".
       */
      why_deferred: zNonEmpty,
      anchors: zAnchors,
      /**
       * Tuỳ chọn CÓ CHỦ ĐÍCH, khác `Module.scope` bắt buộc: phát hiện giữa
       * phiên thường chưa biết thuộc phạm vi nào, bắt buộc = ép bịa. Luật
       * validate ở bước sau sẽ nhắc khi thiếu, không phải schema này.
       */
      scope: zScopeId.optional(),
      status: external_exports.enum(ICEBOX_STATUS).default("open"),
      closed_at: zIsoDate.optional(),
      closed_reason: zNonEmpty.optional(),
      promoted_to: zTaskId.optional(),
      notes: external_exports.string().optional()
    }).strict().superRefine((i, ctx) => {
      if (i.status !== "open" && !i.closed_at) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["closed_at"],
          message: `icebox ${i.id} c\xF3 status="${i.status}" nh\u01B0ng thi\u1EBFu closed_at`
        });
      }
      if (i.status === "closed" && !i.closed_reason) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["closed_reason"],
          message: `icebox ${i.id} \u0111\xF3ng (status="closed") nh\u01B0ng thi\u1EBFu closed_reason. \u0110\xF3ng m\xE0 kh\xF4ng n\xF3i v\xEC sao th\xEC phi\xEAn sau \u0111\u1EC1 xu\u1EA5t l\u1EA1i \u0111\xFAng th\u1EE9 v\u1EEBa b\u1ECB lo\u1EA1i.`
        });
      }
      if (i.status === "promoted" && !i.promoted_to) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["promoted_to"],
          message: `icebox ${i.id} c\xF3 status="promoted" nh\u01B0ng thi\u1EBFu promoted_to`
        });
      }
      if (i.promoted_to && i.status !== "promoted") {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["promoted_to"],
          message: `icebox ${i.id} ch\u1EC9 \u0111\u01B0\u1EE3c c\xF3 promoted_to khi status="promoted"`
        });
      }
      if (i.status === "open" && (i.closed_at !== void 0 || i.closed_reason !== void 0)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["status"],
          message: `icebox ${i.id} status="open" nh\u01B0ng c\xF3 closed_at/closed_reason \u2014 \u0111\xF3ng ch\u01B0a x\u1EA3y ra nh\u01B0ng l\u1EA1i c\xF3 d\u1EA5u v\u1EBFt \u0111\xE3 \u0111\xF3ng`
        });
      }
      const t = Date.parse(i.found_at);
      if (t > Date.now() + CLOCK_SKEW_MS) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["found_at"],
          message: `icebox ${i.id} c\xF3 found_at \u1EDF t\u01B0\u01A1ng lai (${i.found_at}). Ch\u1EC9 \u0111\u1EB7t tr\u01B0\u1EDDng n\xE0y b\u1EB1ng th\u1EDDi \u0111i\u1EC3m ph\xE1t hi\u1EC7n th\u1EADt.`
        });
      }
    });
  }
});

// src/model/verification.ts
function evalWeakness(v) {
  if (v.threshold <= 0.5) {
    return {
      reason: `ng\u01B0\u1EE1ng ${v.threshold} qu\xE1 th\u1EA5p \u2014 \u0111o\xE1n b\u1EEBa c\u0169ng qua \u0111\u01B0\u1EE3c. Ng\u01B0\u1EE1ng d\u01B0\u1EDBi 0.5 th\xEC "pass" kh\xF4ng mang th\xF4ng tin.`
    };
  }
  return null;
}
var VERIFICATION_TIER, EVAL_ADAPTER, zVerificationId, base, zProbeVerification, zEvalVerification, zContractVerification, zVerification;
var init_verification = __esm({
  "src/model/verification.ts"() {
    "use strict";
    init_zod();
    init_common();
    VERIFICATION_TIER = ["smoke", "full"];
    EVAL_ADAPTER = ["json", "promptfoo"];
    zVerificationId = external_exports.string().regex(/^V-[a-z0-9][a-z0-9-]*$/i, "ID verification ph\u1EA3i d\u1EA1ng V-intent-smoke");
    base = {
      id: zVerificationId,
      /**
       * `smoke` rẻ, chạy thường xuyên; `full` tốn tiền, chạy khi cần.
       * Eval gọi LLM tốn tiền thật — mặc định `ganas verify` chỉ chạy smoke.
       */
      tier: external_exports.enum(VERIFICATION_TIER).default("smoke"),
      /** Hết hạn theo thời gian kể cả khi không có gì đổi. 0 = không hết hạn. */
      ttl_days: external_exports.number().int().min(0).default(0),
      /**
       * Lệnh thoát 0 ⇒ bỏ qua, đánh dấu `unavailable`, **KHÔNG phải `failing`**.
       *
       * Báo fail sai độc ngang báo fresh sai: một khối cần DB sẽ báo động giả mỗi
       * phiên, và sau vài lần người ta học cách phớt lờ toàn bộ mục cảnh báo —
       * lúc đó cơ chế còn nguyên nhưng đã chết.
       */
      skip_if: external_exports.string().optional(),
      notes: external_exports.string().optional()
    };
    zProbeVerification = external_exports.object({
      ...base,
      kind: external_exports.literal("probe"),
      run: zNonEmpty.describe("l\u1EC7nh shell ch\u1EA1y \u0111\u01B0\u1EE3c, kh\xF4ng t\u01B0\u01A1ng t\xE1c"),
      expect: zExpect,
      timeout_ms: external_exports.number().int().positive().max(6e5).optional()
    });
    zEvalVerification = external_exports.object({
      ...base,
      kind: external_exports.literal("eval"),
      /** ganas gọi lệnh này và đọc kết quả — nó KHÔNG tự chạy eval. */
      run: zNonEmpty.describe("l\u1EC7nh ch\u1EA1y b\u1ED9 eval, ghi k\u1EBFt qu\u1EA3 ra $GANAS_EVAL_OUT"),
      adapter: external_exports.enum(EVAL_ADAPTER).default("json"),
      threshold: external_exports.number().min(0).max(1),
      /**
       * Vùng đệm quanh ngưỡng. Điểm rơi vào [threshold, threshold+margin) là
       * `marginal` — không phải pass. Eval có nhiễu; coi 0.901 là "đạt" trong khi
       * ngưỡng là 0.9 chỉ là tự lừa mình.
       */
      margin: external_exports.number().min(0).max(0.5).default(0),
      timeout_ms: external_exports.number().int().positive().max(36e5).optional(),
      /* --- Dấu vân tay: kết quả eval chỉ đúng với đúng bộ này ----------------- */
      /** File dataset. Đổi dataset ⇒ kết quả cũ vô nghĩa. */
      dataset: external_exports.string().optional(),
      /** File prompt/template. Sửa một dòng ⇒ kết quả cũ vô nghĩa. */
      prompt: external_exports.string().optional(),
      /** Model đã dùng. Provider đổi model dưới chân bạn ⇒ kết quả cũ vô nghĩa. */
      model: external_exports.string().optional()
    });
    zContractVerification = external_exports.object({
      ...base,
      kind: external_exports.literal("contract"),
      /** Khối phía sau trong sơ đồ mà cạnh này nối tới. */
      to: zNonEmpty.describe("id kh\u1ED1i \u0111\xEDch"),
      /** Lệnh kiểm bổ sung (typecheck, schema check). Thiếu thì chỉ so contract khai báo. */
      run: external_exports.string().optional()
    });
    zVerification = external_exports.discriminatedUnion("kind", [
      zProbeVerification,
      zEvalVerification,
      zContractVerification
    ]);
  }
});

// src/model/module.ts
var MODULE_NATURE, MODULE_STATUS, zPort, zContract, zModule;
var init_module = __esm({
  "src/model/module.ts"() {
    "use strict";
    init_zod();
    init_common();
    init_verification();
    MODULE_NATURE = ["llm", "code", "data", "io"];
    MODULE_STATUS = ["unmapped", "surveyed", "implemented", "verified"];
    zPort = external_exports.object({
      name: zNonEmpty,
      shape: zNonEmpty.describe('m\xF4 t\u1EA3 ki\u1EC3u, vd "string" ho\u1EB7c "{ intent: string, score: number }"'),
      /** Cổng không bắt buộc — khối phía sau không đòi thì vẫn tương thích. */
      optional: external_exports.boolean().default(false),
      notes: external_exports.string().optional()
    });
    zContract = external_exports.object({
      inputs: external_exports.array(zPort).default([]),
      outputs: external_exports.array(zPort).default([])
    });
    zModule = external_exports.object({
      id: zModuleId,
      title: zNonEmpty,
      scope: zScopeId.optional().describe("ph\u1EA1m vi c\xF4ng vi\u1EC7c ch\u1EE9a kh\u1ED1i n\xE0y; thi\u1EBFu = kh\u1ED1i l\u1EBB, s\u1EBD b\u1ECB c\u1EA3nh b\xE1o"),
      nature: external_exports.enum(MODULE_NATURE),
      /** Code của khối nằm ở đâu. Cũng là căn cứ tính STALE khi file đổi. */
      paths: external_exports.array(zGlob).default([]),
      entrypoints: external_exports.array(zNonEmpty).default([]),
      contract: zContract.default({ inputs: [], outputs: [] }),
      /** Cạnh của sơ đồ: khối này cần khối nào chạy trước. */
      depends_on: external_exports.array(zModuleId).default([]),
      status: external_exports.enum(MODULE_STATUS).default("unmapped"),
      owner: zHandle.optional(),
      /** Rỗng ⇒ khối `unverified` ⇒ mọi luồng đi qua nó đều không tin được. */
      verify: external_exports.array(zVerification).default([]),
      /**
       * Kỹ năng gắn với khối — mô tả cách làm việc trong vùng code này (quy ước
       * riêng, cách chunking riêng, v.v.). Gán một lần khi khảo sát/định nghĩa
       * khối, không phải lúc chẻ task — mọi task chạm khối này tự động thấy skill
       * qua brief, không cần khai lại.
       */
      skills: external_exports.array(zNonEmpty).default([]),
      notes: external_exports.string().optional()
    }).strict().superRefine((m, ctx) => {
      if (m.depends_on.includes(m.id)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["depends_on"],
          message: `kh\u1ED1i ${m.id} kh\xF4ng th\u1EC3 ph\u1EE5 thu\u1ED9c ch\xEDnh n\xF3`
        });
      }
      const dup = m.depends_on.find((d, i) => m.depends_on.indexOf(d) !== i);
      if (dup) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["depends_on"],
          message: `kh\u1ED1i ${m.id} li\u1EC7t k\xEA ${dup} hai l\u1EA7n`
        });
      }
      const vids = m.verify.map((v) => v.id);
      const dupV = vids.find((v, i) => vids.indexOf(v) !== i);
      if (dupV) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["verify"],
          message: `kh\u1ED1i ${m.id} c\xF3 hai b\u1EB1ng ch\u1EE9ng tr\xF9ng id "${dupV}"`
        });
      }
      if (m.status === "verified" && m.verify.length === 0) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["status"],
          message: `kh\u1ED1i ${m.id} khai status "verified" nh\u01B0ng \`verify\` r\u1ED7ng \u2014 kh\xF4ng c\xF3 b\u1EB1ng ch\u1EE9ng n\xE0o th\xEC d\u1EF1a v\xE0o \u0111\xE2u m\xE0 n\xF3i \u0111\xE3 verify?`
        });
      }
      if (m.nature === "llm" && m.verify.length > 0 && !m.verify.some((v) => v.kind === "eval")) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["verify"],
          message: `kh\u1ED1i ${m.id} c\xF3 nature "llm" nh\u01B0ng kh\xF4ng c\xF3 b\u1EB1ng ch\u1EE9ng n\xE0o kind "eval". Probe ki\u1EC3m \u0111\u01B0\u1EE3c c\u1EA5u tr\xFAc, kh\xF4ng ki\u1EC3m \u0111\u01B0\u1EE3c h\xE0nh vi c\u1EE7a LLM.`
        });
      }
      if (m.status !== "unmapped" && m.paths.length === 0) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["paths"],
          message: `kh\u1ED1i ${m.id} \u0111\xE3 ${m.status} nh\u01B0ng ch\u01B0a khai \`paths\` \u2014 code c\u1EE7a n\xF3 n\u1EB1m \u1EDF \u0111\xE2u?`
        });
      }
    });
  }
});

// src/model/scope.ts
var SEMVER, SCOPE_STATUS, zScope;
var init_scope = __esm({
  "src/model/scope.ts"() {
    "use strict";
    init_zod();
    init_common();
    init_verification();
    SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
    SCOPE_STATUS = ["draft", "active", "delivered"];
    zScope = external_exports.object({
      id: zScopeId,
      title: zNonEmpty,
      version: external_exports.string().regex(SEMVER, "version ph\u1EA3i theo semver, vd 0.3.0"),
      /**
       * Người ký nghiệm thu. Không ai ký thì không ai nghiệm thu được — luật
       * `scope/without-owner` cảnh báo khi phạm vi `active` mà thiếu.
       */
      owner: zHandle.optional(),
      status: external_exports.enum(SCOPE_STATUS).default("draft"),
      /** Ranh giới code của phạm vi, gián tiếp qua `module.paths`. */
      modules: external_exports.array(zModuleId).min(1, "ph\u1EA1m vi ph\u1EA3i ch\u1EE9a \xEDt nh\u1EA5t m\u1ED9t kh\u1ED1i"),
      /** Khối đầu luồng — dùng để phát hiện khối mồ côi. */
      entry: zModuleId,
      /** Nghiệm thu ở mức phạm vi — chạy trên luồng ghép, không phải từng khối. */
      acceptance: external_exports.array(zVerification).default([]),
      /**
       * Bối cảnh của phạm vi: cái gì TRONG, cái gì NGOÀI, đã hỏi ai.
       *
       * Mọi record khác (module, task, fact, claim, decision, goal, design,
       * verification) đều nhận `notes`; scope là ngoại lệ duy nhất, nên phần
       * đáng ghi nhất của một phạm vi phải nhét vào comment YAML — mà comment
       * thì `ganas brief` không đọc được.
       */
      notes: external_exports.string().optional()
    }).strict().superRefine((s, ctx) => {
      const dup = s.modules.find((m, i) => s.modules.indexOf(m) !== i);
      if (dup) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["modules"],
          message: `ph\u1EA1m vi ${s.id} li\u1EC7t k\xEA kh\u1ED1i ${dup} hai l\u1EA7n`
        });
      }
      if (!s.modules.includes(s.entry)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["entry"],
          message: `ph\u1EA1m vi ${s.id} khai entry: ${s.entry} nh\u01B0ng kh\u1ED1i \u0111\xF3 kh\xF4ng n\u1EB1m trong \`modules\``
        });
      }
      const ids = s.acceptance.map((a) => a.id);
      const dupA = ids.find((a, i) => ids.indexOf(a) !== i);
      if (dupA) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["acceptance"],
          message: `ph\u1EA1m vi ${s.id} c\xF3 hai ti\xEAu ch\xED nghi\u1EC7m thu tr\xF9ng id "${dupA}"`
        });
      }
    });
  }
});

// src/model/task.ts
var TASK_STATUS, ESTIMATED_CONTEXT, zContextContract, zExitCommand, zExitArtifact, zExitHandoff, zExitManual, zExitVerification, zExitCriterion, zTask;
var init_task = __esm({
  "src/model/task.ts"() {
    "use strict";
    init_zod();
    init_common();
    init_config();
    TASK_STATUS = ["todo", "in_progress", "blocked", "done"];
    ESTIMATED_CONTEXT = ["small", "medium", "large"];
    zContextContract = external_exports.object({
      must_read: external_exports.array(
        external_exports.object({
          path: zNonEmpty,
          /** Bắt buộc: một danh sách file không có lý do thì phiên sau đọc mò. */
          why: zNonEmpty
        })
      ).default([]),
      /** Fact phải còn FRESH mới được dùng; brief cảnh báo nếu STALE. */
      facts: external_exports.array(zFactId).default([]),
      open_questions: external_exports.array(zNonEmpty).default([])
    });
    zExitCommand = external_exports.object({
      kind: external_exports.literal("command"),
      run: zNonEmpty,
      expect: zExpect
    });
    zExitArtifact = external_exports.object({
      kind: external_exports.literal("artifact"),
      path: zNonEmpty,
      must_contain: external_exports.string().optional()
    });
    zExitHandoff = external_exports.object({
      kind: external_exports.literal("handoff"),
      required: external_exports.boolean().default(true)
    });
    zExitManual = external_exports.object({
      kind: external_exports.literal("manual"),
      check: zNonEmpty
    });
    zExitVerification = external_exports.object({
      kind: external_exports.literal("verification"),
      target: zNonEmpty.describe(
        "id target trong s\u1ED5 c\xE1i, vd `M-intent/V-intent-eval` (b\u1EB1ng ch\u1EE9ng c\u1EE7a kh\u1ED1i) ho\u1EB7c `F-ACC-001` (fact)"
      )
    });
    zExitCriterion = external_exports.discriminatedUnion("kind", [
      zExitCommand,
      zExitArtifact,
      zExitHandoff,
      zExitManual,
      zExitVerification
    ]);
    zTask = external_exports.object({
      id: zTaskId,
      title: zNonEmpty,
      serves: external_exports.array(zGoalId, { required_error: "task ph\u1EA3i khai `serves` \u2014 n\xF3 ph\u1EE5c v\u1EE5 goal n\xE0o?" }).min(1, "task ph\u1EA3i khai `serves` \u2014 n\xF3 ph\u1EE5c v\u1EE5 goal n\xE0o?"),
      implements: zDesignId.describe("design m\xE0 task n\xE0y hi\u1EC7n th\u1EF1c"),
      /**
       * Phạm vi công việc chứa task. Bắt buộc: task không thuộc phạm vi nào thì
       * không ai nghiệm thu được nó, và tri thức nó sinh ra không biết neo vào đâu.
       */
      scope: zScopeId,
      status: external_exports.enum(TASK_STATUS).default("todo"),
      estimated_context: external_exports.enum(ESTIMATED_CONTEXT).default("medium"),
      context_contract: zContextContract.default({ must_read: [], facts: [], open_questions: [] }),
      /** Kỹ năng cần cho task — brief liệt kê để phiên mới biết nạp gì. */
      skills: external_exports.array(zNonEmpty).default([]),
      /**
       * Tier model nên dùng khi giao task này (cho sub-agent hoặc phiên mới).
       * Gán lúc chẻ task từ plan — quyết định của người/agent thiết kế, KHÔNG
       * suy tự động từ module.nature (heuristic không đáng tin bằng người biết rõ
       * việc). Không gán thì brief không gợi ý model nào — không đoán bừa.
       */
      model: external_exports.enum(MODEL_TIER).optional(),
      /**
       * Khối trong sơ đồ mà task này chạm tới.
       *
       * Đây là điểm nối giữa trục VIỆC và trục HỆ THỐNG: chạm khối nào thì phải để
       * lại bằng chứng cho khối đó (luật `spine/task-missing-verification`).
       */
      touches: external_exports.array(zModuleId).default([]),
      exit_contract: external_exports.array(zExitCriterion, {
        required_error: 'task ph\u1EA3i c\xF3 `exit_contract` \u2014 l\xE0m sao bi\u1EBFt n\xF3 xong? Kh\xF4ng c\xF3 ti\xEAu ch\xED ki\u1EC3m ch\u1EE9ng \u0111\u01B0\u1EE3c th\xEC Stop hook kh\xF4ng ch\u1EA5m \u0111\u01B0\u1EE3c, v\xE0 "xong" tr\u1EDF th\xE0nh \xFD ki\u1EBFn.'
      }).min(1, "task ph\u1EA3i c\xF3 `exit_contract` \u2014 l\xE0m sao bi\u1EBFt n\xF3 xong?"),
      blocked_by: external_exports.array(zTaskId).default([]),
      created_at: zIsoDate.optional(),
      done_at: zIsoDate.optional(),
      notes: external_exports.string().optional()
    }).strict().superRefine((t, ctx) => {
      if (t.blocked_by.includes(t.id)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["blocked_by"],
          message: `task ${t.id} kh\xF4ng th\u1EC3 t\u1EF1 ch\u1EB7n ch\xEDnh n\xF3`
        });
      }
      if (t.status === "done" && !t.done_at) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["done_at"],
          message: `task ${t.id} \u0111\xE1nh d\u1EA5u done nh\u01B0ng thi\u1EBFu done_at`
        });
      }
      const dupServes = t.serves.find((g, i) => t.serves.indexOf(g) !== i);
      if (dupServes) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["serves"],
          message: `task ${t.id} li\u1EC7t k\xEA goal ${dupServes} hai l\u1EA7n`
        });
      }
    });
  }
});

// src/model/index.ts
var init_model = __esm({
  "src/model/index.ts"() {
    "use strict";
    init_anchor();
    init_common();
    init_config();
    init_design();
    init_goal();
    init_icebox();
    init_knowledge();
    init_module();
    init_scope();
    init_task();
    init_verification();
  }
});

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode2(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode2;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path) {
      const ctrl = callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path) {
      const ctrl = await callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key, node, path);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path);
      return void 0;
    }
    function replaceNode(key, path, node) {
      const parent = path[path.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid2 = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid2);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (data?.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key, ...rest] = path;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num2 = typeof value === "number" ? value : Number(value);
      if (!isFinite(num2))
        return isNaN(num2) ? ".nan" : num2 < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num2 = Number(node.value);
        return isFinite(num2) ? num2.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num2 = Number(node.value);
        return isFinite(num2) ? num2.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num2 = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num2(60) + num2(p), num2(0));
      return sign === "-" ? num2(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num2 = (n) => n;
      if (typeof value === "bigint")
        num2 = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num2(-1);
      }
      const _60 = num2(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep: sep2, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep2?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep2) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep2 ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep2, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep2 = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep2 + cb;
              sep2 = "";
              break;
            }
            case "newline":
              if (comment)
                sep2 += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep: sep2, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep2?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep2 && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep2 && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep2, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep2 ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep2)
                for (const st of sep2) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep2, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep2 = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep2 + indent.slice(trimIndent) + content;
          sep2 = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep2 === " ")
            sep2 = "\n";
          else if (!prevMoreIndented && sep2 === "\n")
            sep2 = "\n\n";
          value += sep2 + indent.slice(trimIndent) + content;
          sep2 = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep2 === "\n")
            value += "\n";
          else
            sep2 = "\n";
        } else {
          value += sep2 + content;
          sep2 = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res = match[1];
      let sep2 = " ";
      let pos = first.lastIndex;
      line.lastIndex = pos;
      while (match = line.exec(source)) {
        if (match[1] === "") {
          if (sep2 === "\n")
            res += sep2;
          else
            sep2 = "\n";
        } else {
          res += sep2 + match[1];
          sep2 = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep2 + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep: sep2, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep2)
        for (const st of sep2)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote3 = this.charAt(0);
        let end = this.buffer.indexOf(quote3, this.pos + 1);
        if (quote3 === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep2;
          if (scalar.end) {
            sep2 = scalar.end;
            sep2.push(this.sourceToken);
            delete scalar.end;
          } else
            sep2 = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep: sep2 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep2 = it.sep;
                  sep2.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep: sep2 }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep2 = fc.end.splice(1, fc.end.length);
            sep2.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep: sep2 }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument6(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument6(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument6;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/util/yaml.ts
import { readFile as readFile2 } from "node:fs/promises";
async function readYamlFile(file) {
  let source;
  try {
    source = await readFile2(file, "utf8");
  } catch (err) {
    throw new GanasError(`kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c ${file}: ${err.message}`);
  }
  const doc = (0, import_yaml.parseDocument)(source, { keepSourceTokens: false });
  if (doc.errors.length > 0) {
    const first = doc.errors[0];
    const line = offsetToLine(source, first.pos[0]);
    throw new GanasError(`${file}:${line}: YAML kh\xF4ng h\u1EE3p l\u1EC7 \u2014 ${first.message}`);
  }
  return { value: doc.toJS({ maxAliasCount: 100 }), doc, source, file };
}
function offsetToLine(source, offset) {
  let line = 1;
  const end = Math.min(offset, source.length);
  for (let i = 0; i < end; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}
function lineOfPath(loaded, path) {
  const { doc, source } = loaded;
  for (let len = path.length; len >= 0; len--) {
    const sub = path.slice(0, len);
    const node = sub.length === 0 ? doc.contents : doc.getIn(sub, true);
    if ((0, import_yaml.isNode)(node) && node.range) return offsetToLine(source, node.range[0]);
  }
  return void 0;
}
var import_yaml;
var init_yaml = __esm({
  "src/util/yaml.ts"() {
    "use strict";
    import_yaml = __toESM(require_dist(), 1);
    init_errors();
  }
});

// src/verify/ledger.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync3 } from "node:fs";
import { appendFile, mkdir, readFile as readFile3 } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname as dirname2 } from "node:path";
function sha256(input) {
  return createHash("sha256").update(input, "utf8").digest("hex").slice(0, 16);
}
function definitionHash(def) {
  return sha256(canonical(def));
}
function defHash(definition, statement) {
  const base2 = definition === null || typeof definition !== "object" || Array.isArray(definition) ? definition : (() => {
    const stripped = { ...definition };
    for (const field of FINGERPRINT_FIELDS) delete stripped[field];
    return stripped;
  })();
  return definitionHash({ def: base2, statement: statement ?? null });
}
function canonical(value) {
  if (value === null || value === void 0) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
async function fileHash(path) {
  try {
    return sha256(await readFile3(path, "utf8"));
  } catch {
    return "";
  }
}
function ledgerPath(root) {
  return ganasPath(root, LEDGER_FILE);
}
function chainContent(entry) {
  const content = { ...entry };
  delete content["seq"];
  delete content["prev_hash"];
  return content;
}
function chainStep(runningHash, entry) {
  return createHash("sha256").update(runningHash + canonical(chainContent(entry))).digest("hex");
}
function runningHashOf(entries) {
  let running = CHAIN_GENESIS;
  for (const e of entries) {
    if (e.prev_hash === void 0) continue;
    running = chainStep(running, e);
  }
  return running;
}
async function appendEntry(root, entry) {
  const file = ledgerPath(root);
  await mkdir(dirname2(file), { recursive: true });
  const existing = await readLedger(root);
  const lastSeq = existing.length > 0 ? existing[existing.length - 1].seq ?? 0 : 0;
  const chained = {
    ...entry,
    seq: lastSeq + 1,
    prev_hash: runningHashOf(existing)
  };
  await appendFile(file, JSON.stringify(chained) + "\n", "utf8");
}
function verifyChain(entries) {
  let running = CHAIN_GENESIS;
  let started = false;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!started) {
      if (e.prev_hash === void 0) continue;
      started = true;
    }
    if (e.prev_hash !== running) return { ok: false, brokenAt: i };
    running = chainStep(running, e);
  }
  return { ok: true };
}
function ledgerCorruption(root) {
  return corruptLines.get(root) ?? 0;
}
async function readLedger(root) {
  const file = ledgerPath(root);
  corruptLines.set(root, 0);
  if (!existsSync3(file)) return [];
  const raw = await readFile3(file, "utf8");
  const out = [];
  let bad = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.target && parsed.at) out.push(parsed);
      else bad++;
    } catch {
      bad++;
    }
  }
  corruptLines.set(root, bad);
  return out;
}
function indexByTarget(entries) {
  const map = /* @__PURE__ */ new Map();
  for (const e of entries) {
    const list = map.get(e.target);
    if (list) list.push(e);
    else map.set(e.target, [e]);
  }
  return map;
}
function lastFor(index, target) {
  const list = index.get(target);
  return list?.[list.length - 1];
}
function historyFor(index, target, k = 5) {
  return (index.get(target) ?? []).slice(-k);
}
function entryAt(index, target, at2) {
  return (index.get(target) ?? []).find((e) => e.at === at2);
}
async function runContext(root, by) {
  const git = await runShell("git rev-parse --short HEAD", { cwd: root, timeoutMs: 5e3 });
  return {
    by,
    ...git.code === 0 ? { git: git.stdout.trim() } : {},
    host: hostname()
  };
}
var LEDGER_FILE, FINGERPRINT_FIELDS, CHAIN_GENESIS, corruptLines;
var init_ledger = __esm({
  "src/verify/ledger.ts"() {
    "use strict";
    init_paths();
    init_exec();
    LEDGER_FILE = "verify-ledger.jsonl";
    FINGERPRINT_FIELDS = ["model", "prompt", "dataset"];
    CHAIN_GENESIS = "0".repeat(64);
    corruptLines = /* @__PURE__ */ new Map();
  }
});

// src/verify/lint.ts
function tokensOf(text) {
  const out = /* @__PURE__ */ new Set();
  for (const m of text.matchAll(/["'`]([^"'`]{2,})["'`]/g)) {
    out.add(m[1].toLowerCase());
  }
  for (const m of text.matchAll(/[A-Za-z0-9_./-]*[/.][A-Za-z0-9_./-]+/g)) {
    const t = m[0].toLowerCase().replace(/^\.\//, "");
    if (t.length >= 3) out.add(t);
  }
  for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_]{2,}/g)) {
    out.add(m[0].toLowerCase());
  }
  return out;
}
function lintProbe(input) {
  const findings = [];
  const run20 = input.run.trim();
  for (const [pattern, what] of DANGEROUS) {
    if (pattern.test(run20)) {
      findings.push({
        code: "dangerous",
        severity: "error",
        message: `probe ch\u1EE9a thao t\xE1c nguy hi\u1EC3m (${what}): \`${run20}\``,
        hint: `ganas s\u1EBD KH\xD4NG ch\u1EA1y l\u1EC7nh n\xE0y. Probe ch\u1EC9 \u0111\u01B0\u1EE3c \u0111\u1ECDc v\xE0 ki\u1EC3m tra, kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1ED5i tr\u1EA1ng th\xE1i h\u1EC7 th\u1ED1ng.`
      });
      return findings;
    }
  }
  const simple = run20.replace(/^\s*\(\s*|\s*\)\s*$/g, "").trim();
  if (ALWAYS_TRUE.some((re) => re.test(simple))) {
    findings.push({
      code: "tautological",
      severity: "error",
      message: `probe \`${run20}\` lu\xF4n th\xE0nh c\xF4ng \u2014 n\xF3 kh\xF4ng ki\u1EC3m ch\u1EE9ng \u0111i\u1EC1u g\xEC c\u1EA3`,
      hint: `Probe ph\u1EA3i c\xF3 kh\u1EA3 n\u0103ng FAIL khi ph\xE1t bi\u1EC3u sai. Vi\u1EBFt l\u1EC7nh th\u1EADt s\u1EF1 ch\u1EA1m v\xE0o th\u1EE9 \u0111ang \u0111\u01B0\u1EE3c kh\u1EB3ng \u0111\u1ECBnh (vd \`test -f <\u0111\u01B0\u1EDDng-d\u1EABn>\`, \`grep -q '<chu\u1ED7i>' <file>\`, \`npm test -- <t\xEAn-test>\`).`
    });
    return findings;
  }
  const haystack = [input.statement ?? "", ...input.context ?? []].join(" ");
  if (haystack.trim()) {
    const probeTokens = [...tokensOf(run20)].filter((t) => !SHELL_NOISE.has(t));
    const claimTokens = tokensOf(haystack);
    const shared = probeTokens.some(
      (t) => [...claimTokens].some((c) => c === t || c.includes(t) || t.includes(c))
    );
    if (probeTokens.length > 0 && !shared) {
      findings.push({
        code: "unrelated",
        severity: "warning",
        message: `probe \`${run20}\` kh\xF4ng nh\u1EAFc t\u1EDBi th\u1EE9 g\xEC c\xF3 trong ph\xE1t bi\u1EC3u \u2014 nhi\u1EC1u kh\u1EA3 n\u0103ng n\xF3 \u0111ang ki\u1EC3m m\u1ED9t th\u1EE9 kh\xE1c`,
        hint: `Ki\u1EC3m l\u1EA1i xem probe c\xF3 th\u1EADt s\u1EF1 ki\u1EC3m \u0111\xFAng \u0111i\u1EC1u \u0111ang \u0111\u01B0\u1EE3c kh\u1EB3ng \u0111\u1ECBnh kh\xF4ng.`
      });
    }
  }
  return findings;
}
function hasBlockingFinding(findings) {
  return findings.some((f) => f.severity === "error");
}
var ALWAYS_TRUE, DANGEROUS, SHELL_NOISE;
var init_lint = __esm({
  "src/verify/lint.ts"() {
    "use strict";
    ALWAYS_TRUE = [/^true$/, /^:$/, /^exit\s+0$/, /^echo\b[^|;&]*$/, /^printf\b[^|;&]*$/];
    DANGEROUS = [
      [/\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rf]/, "xo\xE1 \u0111\u1EC7 quy"],
      [/\bgit\s+push\b/, "\u0111\u1EA9y l\xEAn remote"],
      [/\bgit\s+reset\s+--hard\b/, "v\u1EE9t b\u1ECF thay \u0111\u1ED5i"],
      [/\bgit\s+clean\s+-[a-zA-Z]*[fd]/, "xo\xE1 file ch\u01B0a track"],
      [/\bsudo\b/, "leo quy\u1EC1n"],
      [/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba)?sh\b/, "t\u1EA3i v\u1EC1 r\u1ED3i ch\u1EA1y th\u1EB3ng"],
      [/\bdd\s+if=/, "ghi \u0111\xE8 thi\u1EBFt b\u1ECB"],
      [/\bmkfs\b/, "format"],
      [/:\(\)\s*\{.*\}\s*;\s*:/, "fork bomb"],
      [/>\s*\/dev\/(sd|nvme|disk)/, "ghi th\u1EB3ng v\xE0o \u1ED5 \u0111\u0129a"],
      [/\bshutdown\b|\breboot\b/, "t\u1EAFt/kh\u1EDFi \u0111\u1ED9ng l\u1EA1i m\xE1y"]
    ];
    SHELL_NOISE = /* @__PURE__ */ new Set([
      "test",
      "grep",
      "rip",
      "npm",
      "npx",
      "run",
      "node",
      "bash",
      "sh",
      "cat",
      "ls",
      "find",
      "true",
      "false",
      "exit",
      "echo",
      "printf",
      "head",
      "tail",
      "wc",
      "sed",
      "awk",
      "jq",
      "the",
      "and",
      "not",
      "for",
      "with",
      "out",
      "dev",
      "null",
      "quiet",
      "count"
    ]);
  }
});

// src/graph/validate.ts
import { existsSync as existsSync4 } from "node:fs";
import { join as join3 } from "node:path";
function at(graph, sourced, ...path) {
  const loaded = graph.sources.get(sourced.file);
  if (!loaded) return void 0;
  const full = sourced.index === void 0 ? path : [sourced.index, ...path];
  return lineOfPath(loaded, full);
}
function findCycle(edges) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = /* @__PURE__ */ new Map();
  const stack = [];
  function visit(node) {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const start = stack.indexOf(next);
        return [...stack.slice(start), next];
      }
      if (c === WHITE) {
        const cycle = visit(next);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return null;
  }
  for (const node of edges.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      const cycle = visit(node);
      if (cycle) return cycle;
    }
  }
  return null;
}
function validateGraph(graph, opts = {}) {
  const now = opts.now ?? Date.now();
  const diags = [...graph.loadDiagnostics];
  for (const design of graph.designs.values()) {
    const d = design.value;
    d.serves.forEach((goalId, i) => {
      const goal = graph.goals.get(goalId);
      if (!goal) {
        diags.push({
          severity: "error",
          code: "spine/design-missing-goal",
          message: `design ${d.id} ph\u1EE5c v\u1EE5 goal ${goalId} nh\u01B0ng goal \u0111\xF3 kh\xF4ng t\u1ED3n t\u1EA1i`,
          file: design.file,
          line: at(graph, design, "serves", i),
          hint: `T\u1EA1o .ganas/goals/${goalId}.yaml, ho\u1EB7c s\u1EEDa l\u1EA1i serves.`
        });
        return;
      }
      if (goal.value.status === "draft") {
        diags.push({
          severity: "warning",
          code: "spine/design-serves-draft-goal",
          message: `design ${d.id} ph\u1EE5c v\u1EE5 goal ${goalId} c\xF2n \u1EDF tr\u1EA1ng th\xE1i draft (ch\u01B0a c\xF3 ng\u01B0\u1EDDi duy\u1EC7t)`,
          file: design.file,
          line: at(graph, design, "serves", i),
          hint: `Ch\u1ED1t goal tr\u01B0\u1EDBc: \u0111\u1EB7t approved_by + approved_at r\u1ED3i chuy\u1EC3n status: active.`
        });
      }
    });
    const allClosed = d.serves.length > 0 && d.serves.every((g) => graph.goals.get(g)?.value.status === "closed");
    if (allClosed && d.status !== "archived" && d.status !== "superseded") {
      diags.push({
        severity: "warning",
        code: "spine/design-orphaned",
        message: `design ${d.id} m\u1ED3 c\xF4i: m\u1ECDi goal n\xF3 ph\u1EE5c v\u1EE5 \u0111\xE3 closed`,
        file: design.file,
        line: at(graph, design, "status"),
        hint: `\u0110\u1EB7t status: archived, ho\u1EB7c tr\u1ECF serves sang goal \u0111ang active.`
      });
    }
    d.decisions.forEach((decId, i) => {
      if (!graph.decisions.has(decId)) {
        diags.push({
          severity: "error",
          code: "spine/design-missing-decision",
          message: `design ${d.id} d\u1EABn decision ${decId} kh\xF4ng t\u1ED3n t\u1EA1i`,
          file: design.file,
          line: at(graph, design, "decisions", i)
        });
      }
    });
    d.supersedes.forEach((oldId, i) => {
      if (!graph.designs.has(oldId)) {
        diags.push({
          severity: "error",
          code: "spine/design-missing-supersede",
          message: `design ${d.id} thay th\u1EBF design ${oldId} kh\xF4ng t\u1ED3n t\u1EA1i`,
          file: design.file,
          line: at(graph, design, "supersedes", i)
        });
      }
    });
  }
  for (const task of graph.tasks.values()) {
    const t = task.value;
    t.serves.forEach((goalId, i) => {
      if (!graph.goals.has(goalId)) {
        diags.push({
          severity: "error",
          code: "spine/task-missing-goal",
          message: `task ${t.id} ph\u1EE5c v\u1EE5 goal ${goalId} kh\xF4ng t\u1ED3n t\u1EA1i`,
          file: task.file,
          line: at(graph, task, "serves", i)
        });
      }
    });
    const design = graph.designs.get(t.implements);
    if (!design) {
      diags.push({
        severity: "error",
        code: "spine/task-missing-design",
        message: `task ${t.id} hi\u1EC7n th\u1EF1c design ${t.implements} kh\xF4ng t\u1ED3n t\u1EA1i`,
        file: task.file,
        line: at(graph, task, "implements"),
        hint: `M\u1ECDi task ph\u1EA3i neo v\xE0o m\u1ED9t design; design ph\u1EA3i neo v\xE0o goal.`
      });
    } else {
      const stray = t.serves.filter((g) => !design.value.serves.includes(g));
      if (stray.length > 0) {
        diags.push({
          severity: "error",
          code: "spine/task-goal-not-in-design",
          message: `task ${t.id} ph\u1EE5c v\u1EE5 ${stray.join(", ")} nh\u01B0ng design ${design.value.id} kh\xF4ng ph\u1EE5c v\u1EE5 goal \u0111\xF3 (design ph\u1EE5c v\u1EE5: ${design.value.serves.join(", ")})`,
          file: task.file,
          line: at(graph, task, "serves"),
          hint: `Ho\u1EB7c b\u1ED5 sung goal v\xE0o design ${design.value.id}, ho\u1EB7c chuy\u1EC3n task sang design kh\xE1c. Spine ph\u1EA3i li\u1EC1n m\u1EA1ch task \u2192 design \u2192 goal.`
        });
      }
    }
    const scope = graph.scopes.get(t.scope);
    if (!scope) {
      diags.push({
        severity: "error",
        code: "scope/task-scope-not-found",
        message: `task ${t.id} thu\u1ED9c ph\u1EA1m vi ${t.scope} kh\xF4ng t\u1ED3n t\u1EA1i`,
        file: task.file,
        line: at(graph, task, "scope"),
        hint: `T\u1EA1o ph\u1EA1m vi b\u1EB1ng \`ganas scope new\`, ho\u1EB7c chuy\u1EC3n task sang ph\u1EA1m vi \u0111\xE3 c\xF3.`
      });
    } else {
      const outside = t.touches.filter((m) => !scope.value.modules.includes(m));
      if (outside.length > 0) {
        diags.push({
          severity: "error",
          code: "scope/task-touches-outside-scope",
          message: `task ${t.id} ch\u1EA1m kh\u1ED1i ${outside.join(", ")} nh\u01B0ng ph\u1EA1m vi ${t.scope} kh\xF4ng ch\u1EE9a kh\u1ED1i \u0111\xF3 (ph\u1EA1m vi ch\u1EE9a: ${scope.value.modules.join(", ")})`,
          file: task.file,
          line: at(graph, task, "touches"),
          hint: `Ho\u1EB7c th\xEAm kh\u1ED1i v\xE0o ph\u1EA1m vi ${t.scope}, ho\u1EB7c ch\u1EBB task \u2014 m\u1ED9t task ch\u1EA1m hai ph\u1EA1m vi th\xEC kh\xF4ng ai nghi\u1EC7m thu \u0111\u01B0\u1EE3c n\xF3.`
        });
      }
    }
    t.blocked_by.forEach((blockerId, i) => {
      if (!graph.tasks.has(blockerId)) {
        diags.push({
          severity: "error",
          code: "spine/task-missing-blocker",
          message: `task ${t.id} b\u1ECB ch\u1EB7n b\u1EDFi task ${blockerId} kh\xF4ng t\u1ED3n t\u1EA1i`,
          file: task.file,
          line: at(graph, task, "blocked_by", i)
        });
      }
    });
    const verifiedTargets = t.exit_contract.filter(
      (c) => c.kind === "verification"
    ).map((c) => c.target);
    t.touches.forEach((moduleId, i) => {
      const mod = graph.modules.get(moduleId);
      if (!mod) {
        diags.push({
          severity: "error",
          code: "spine/task-missing-module",
          message: `task ${t.id} ch\u1EA1m kh\u1ED1i ${moduleId} nh\u01B0ng kh\u1ED1i \u0111\xF3 kh\xF4ng t\u1ED3n t\u1EA1i`,
          file: task.file,
          line: at(graph, task, "touches", i)
        });
        return;
      }
      const covered = verifiedTargets.some(
        (target) => target === moduleId || target.startsWith(`${moduleId}/`)
      );
      if (!covered) {
        diags.push({
          severity: "error",
          code: "spine/task-missing-verification",
          message: `task ${t.id} ch\u1EA1m kh\u1ED1i ${moduleId} nh\u01B0ng \`exit_contract\` kh\xF4ng c\xF3 ti\xEAu ch\xED \`kind: verification\` n\xE0o ki\u1EC3m kh\u1ED1i \u0111\xF3`,
          file: task.file,
          line: at(graph, task, "touches", i),
          hint: mod.value.verify.length > 0 ? `Th\xEAm v\xE0o exit_contract: { kind: verification, target: "${moduleId}/${mod.value.verify[0].id}" }` : `Kh\u1ED1i ${moduleId} ch\u01B0a c\xF3 \`verify\` n\xE0o \u2014 th\xEAm b\u1EB1ng ch\u1EE9ng cho kh\u1ED1i tr\u01B0\u1EDBc, r\u1ED3i tr\u1ECF exit_contract v\xE0o \u0111\xF3.`
        });
      }
    });
    t.context_contract.facts.forEach((factId, i) => {
      if (!graph.facts.has(factId)) {
        diags.push({
          severity: "error",
          code: "knowledge/task-missing-fact",
          message: `task ${t.id} c\u1EA7n fact ${factId} nh\u01B0ng fact \u0111\xF3 kh\xF4ng t\u1ED3n t\u1EA1i`,
          file: task.file,
          line: at(graph, task, "context_contract", "facts", i)
        });
      }
    });
    if (!t.model && t.status !== "done") {
      diags.push({
        severity: "warning",
        code: "spine/task-missing-model",
        message: `task ${t.id} ch\u01B0a g\xE1n \`model\` \u2014 ch\u01B0a ai quy\u1EBFt tier n\xE0o l\xE0m vi\u1EC7c n\xE0y`,
        file: task.file,
        line: at(graph, task, "status"),
        hint: `Th\xEAm \`model: main|verifier|scribe\` (main = kh\xF3/m\u01A1 h\u1ED3, verifier = kho\u1EA3ng gi\u1EEFa, scribe = c\u01A1 h\u1ECDc). Thi\u1EBFu n\xF3, brief kh\xF4ng giao \u0111\u01B0\u1EE3c task cho sub-agent n\xE0o.`
      });
    }
    if (t.estimated_context === "large") {
      diags.push({
        severity: "warning",
        code: "spine/task-too-large",
        message: `task ${t.id} \u01B0\u1EDBc l\u01B0\u1EE3ng context "large" \u2014 nhi\u1EC1u kh\u1EA3 n\u0103ng kh\xF4ng v\u1EEBa m\u1ED9t phi\xEAn`,
        file: task.file,
        line: at(graph, task, "estimated_context"),
        hint: `Ch\u1EBB th\xE0nh c\xE1c task nh\u1ECF h\u01A1n. Task qu\xE1 l\u1EDBn bu\u1ED9c ph\u1EA3i compact gi\u1EEFa ch\u1EEBng, v\xE0 \u0111\xF3 l\xE0 l\xFAc tri th\u1EE9c b\u1ECB m\u1EA5t ho\u1EB7c b\u1ECB b\xF3p m\xE9o.`
      });
    }
  }
  for (const scope of graph.scopes.values()) {
    const sc = scope.value;
    sc.modules.forEach((moduleId, i) => {
      if (!graph.modules.has(moduleId)) {
        diags.push({
          severity: "error",
          code: "scope/missing-module",
          message: `ph\u1EA1m vi ${sc.id} ch\u1EE9a kh\u1ED1i ${moduleId} kh\xF4ng t\u1ED3n t\u1EA1i`,
          file: scope.file,
          line: at(graph, scope, "modules", i)
        });
      }
    });
    if (sc.status === "active" && sc.acceptance.length === 0) {
      diags.push({
        severity: "warning",
        code: "scope/without-acceptance",
        message: `ph\u1EA1m vi ${sc.id} \u0111ang active nh\u01B0ng kh\xF4ng c\xF3 ti\xEAu ch\xED nghi\u1EC7m thu n\xE0o`,
        file: scope.file,
        line: at(graph, scope, "acceptance"),
        hint: `Nghi\u1EC7m thu m\u1EE9c ph\u1EA1m vi ch\u1EA1y tr\xEAn LU\u1ED2NG \u0110\xC3 GH\xC9P \u2014 m\u1ED9t lu\u1ED3ng c\xF3 th\u1EC3 \u0111\xFAng \u1EDF t\u1EEBng kh\u1ED1i m\xE0 v\u1EABn sai khi gh\xE9p. Thi\u1EBFu n\xF3 th\xEC "b\xE0n giao xong" l\xE0 \xFD ki\u1EBFn.`
      });
    }
    if (sc.status === "active" && !sc.owner) {
      diags.push({
        severity: "warning",
        code: "scope/without-owner",
        message: `ph\u1EA1m vi ${sc.id} \u0111ang active nh\u01B0ng kh\xF4ng ai k\xFD nghi\u1EC7m thu`,
        file: scope.file,
        line: at(graph, scope, "id"),
        hint: `Khai \`owner: "@ten"\` \u2014 kh\xF4ng ai k\xFD th\xEC kh\xF4ng ai nghi\u1EC7m thu \u0111\u01B0\u1EE3c.`
      });
    }
  }
  for (const module of graph.modules.values()) {
    const m = module.value;
    if (m.scope === void 0) {
      diags.push({
        severity: "warning",
        code: "scope/module-without-scope",
        message: `kh\u1ED1i ${m.id} kh\xF4ng thu\u1ED9c ph\u1EA1m vi n\xE0o \u2014 s\u1EBD kh\xF4ng n\u1EB1m trong b\u1ED9 b\xE0n giao n\xE0o`,
        file: module.file,
        line: at(graph, module, "id")
      });
    } else {
      const scope = graph.scopes.get(m.scope);
      if (!scope) {
        diags.push({
          severity: "error",
          code: "scope/module-scope-not-found",
          message: `kh\u1ED1i ${m.id} khai thu\u1ED9c ph\u1EA1m vi ${m.scope} nh\u01B0ng ph\u1EA1m vi \u0111\xF3 kh\xF4ng t\u1ED3n t\u1EA1i`,
          file: module.file,
          line: at(graph, module, "scope")
        });
      } else if (!scope.value.modules.includes(m.id)) {
        diags.push({
          severity: "error",
          code: "scope/module-scope-mismatch",
          message: `kh\u1ED1i ${m.id} khai thu\u1ED9c ph\u1EA1m vi ${m.scope}, nh\u01B0ng ph\u1EA1m vi \u0111\xF3 kh\xF4ng li\u1EC7t k\xEA n\xF3 trong \`modules\``,
          file: module.file,
          line: at(graph, module, "scope"),
          hint: `Th\xEAm ${m.id} v\xE0o \`modules\` c\u1EE7a ${m.scope}, ho\u1EB7c s\u1EEDa \`scope\` c\u1EE7a kh\u1ED1i.`
        });
      }
    }
    m.depends_on.forEach((depId, i) => {
      if (!graph.modules.has(depId)) {
        diags.push({
          severity: "error",
          code: "spine/module-missing-dependency",
          message: `kh\u1ED1i ${m.id} ph\u1EE5 thu\u1ED9c kh\u1ED1i ${depId} kh\xF4ng t\u1ED3n t\u1EA1i`,
          file: module.file,
          line: at(graph, module, "depends_on", i)
        });
      }
    });
    m.verify.forEach((v, i) => {
      if (v.kind === "contract" && !graph.modules.has(v.to)) {
        diags.push({
          severity: "error",
          code: "spine/contract-missing-target",
          message: `kh\u1ED1i ${m.id} khai c\u1EA1nh h\u1EE3p \u0111\u1ED3ng ${v.id} t\u1EDBi kh\u1ED1i ${v.to} nh\u01B0ng kh\u1ED1i \u0111\xF3 kh\xF4ng t\u1ED3n t\u1EA1i`,
          file: module.file,
          line: at(graph, module, "verify", i, "to"),
          hint: `S\u1EEDa \`to\`, ho\u1EB7c t\u1EA1o kh\u1ED1i ${v.to}. \`ganas trace\` s\u1EBD kh\xF4ng ki\u1EC3m \u0111\u01B0\u1EE3c c\u1EA1nh n\xE0y t\u1EDBi khi \u0111\xF3.`
        });
      }
    });
    if (m.verify.length === 0 && m.status !== "unmapped") {
      diags.push({
        severity: "warning",
        code: "verify/module-unverified",
        message: `kh\u1ED1i ${m.id} ch\u01B0a c\xF3 b\u1EB1ng ch\u1EE9ng n\xE0o \u2014 m\u1ECDi lu\u1ED3ng \u0111i qua n\xF3 \u0111\u1EC1u kh\xF4ng tin \u0111\u01B0\u1EE3c`,
        file: module.file,
        line: at(graph, module, "id"),
        hint: m.nature === "llm" ? `Kh\u1ED1i g\u1ECDi LLM: th\xEAm m\u1ED9t b\u1EB1ng ch\u1EE9ng \`kind: eval\` v\u1EDBi dataset v\xE0 ng\u01B0\u1EE1ng.` : `Th\xEAm m\u1ED9t b\u1EB1ng ch\u1EE9ng \`kind: probe\` ch\u1EA1y \u0111\u01B0\u1EE3c (unit test, typecheck\u2026).`
      });
    }
    const moduleContext = [
      ...m.paths,
      ...m.entrypoints,
      ...m.contract.inputs.map((p) => p.name),
      ...m.contract.outputs.map((p) => p.name)
    ];
    for (const v of m.verify) {
      if (v.kind === "eval") {
        const weak = evalWeakness(v);
        if (weak) {
          diags.push({
            severity: "warning",
            code: "verify/eval-weak",
            message: `b\u1EB1ng ch\u1EE9ng ${m.id}/${v.id}: ${weak.reason}`,
            file: module.file,
            line: at(graph, module, "verify")
          });
        }
      }
      if (v.kind === "probe") {
        for (const f of lintProbe({ run: v.run, statement: m.title, context: moduleContext })) {
          diags.push({
            severity: f.severity,
            code: `verify/${f.code === "unrelated" ? "probe-unrelated" : f.code}`,
            message: `b\u1EB1ng ch\u1EE9ng ${m.id}/${v.id}: ${f.message}`,
            file: module.file,
            line: at(graph, module, "verify"),
            hint: f.hint
          });
        }
      }
    }
  }
  for (const scope of graph.scopes.values()) {
    const sc = scope.value;
    const inScope = new Set(sc.modules);
    const neighbours = /* @__PURE__ */ new Map();
    for (const id of inScope) neighbours.set(id, []);
    for (const id of inScope) {
      const mod = graph.modules.get(id);
      if (!mod) continue;
      for (const dep of mod.value.depends_on) {
        if (!inScope.has(dep)) continue;
        neighbours.get(id).push(dep);
        neighbours.get(dep).push(id);
      }
    }
    const seen = /* @__PURE__ */ new Set();
    const root = inScope.has(sc.entry) ? sc.entry : sc.modules[0];
    const queue = root === void 0 ? [] : [root];
    while (queue.length) {
      const cur = queue.shift();
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of neighbours.get(cur) ?? []) queue.push(next);
    }
    for (const id of sc.modules) {
      if (!seen.has(id) && graph.modules.has(id)) {
        diags.push({
          severity: "warning",
          code: "scope/module-orphaned",
          message: `kh\u1ED1i ${id} kh\xF4ng n\u1ED1i v\xE0o s\u01A1 \u0111\u1ED3 c\u1EE7a ph\u1EA1m vi ${sc.id} \u2014 kh\xF4ng c\xF3 \`depends_on\` n\xE0o n\u1ED1i n\xF3 v\u1EDBi c\xE1c kh\u1ED1i c\xF2n l\u1EA1i`,
          file: scope.file,
          line: at(graph, scope, "modules"),
          hint: `N\u1ED1i n\xF3 v\xE0o s\u01A1 \u0111\u1ED3 qua \`depends_on\` (chi\u1EC1u n\xE0o c\u0169ng \u0111\u01B0\u1EE3c), ho\u1EB7c b\u1ECF kh\u1ECFi \`modules\` c\u1EE7a ph\u1EA1m vi.`
        });
      }
    }
  }
  const moduleEdges = /* @__PURE__ */ new Map();
  for (const [id, m] of graph.modules) moduleEdges.set(id, m.value.depends_on);
  const moduleCycle = findCycle(moduleEdges);
  if (moduleCycle) {
    const head = graph.modules.get(moduleCycle[0]);
    diags.push({
      severity: "error",
      code: "spine/module-cycle",
      message: `v\xF2ng l\u1EB7p ph\u1EE5 thu\u1ED9c gi\u1EEFa c\xE1c kh\u1ED1i: ${moduleCycle.join(" \u2192 ")}`,
      file: head.file,
      line: at(graph, head, "depends_on"),
      hint: `S\u01A1 \u0111\u1ED3 kh\u1ED1i ph\u1EA3i l\xE0 \u0111\u1ED3 th\u1ECB kh\xF4ng chu tr\xECnh, n\u1EBFu kh\xF4ng kh\xF4ng lan truy\u1EC1n \u0111\u01B0\u1EE3c \u0111\u1ED9 tin.`
    });
  }
  const taskEdges = /* @__PURE__ */ new Map();
  for (const [id, t] of graph.tasks) taskEdges.set(id, t.value.blocked_by);
  const taskCycle = findCycle(taskEdges);
  if (taskCycle) {
    const head = graph.tasks.get(taskCycle[0]);
    diags.push({
      severity: "error",
      code: "spine/task-cycle",
      message: `v\xF2ng l\u1EB7p ph\u1EE5 thu\u1ED9c gi\u1EEFa c\xE1c task: ${taskCycle.join(" \u2192 ")}`,
      file: head.file,
      line: at(graph, head, "blocked_by")
    });
  }
  const designEdges = /* @__PURE__ */ new Map();
  for (const [id, d] of graph.designs) designEdges.set(id, d.value.supersedes);
  const designCycle = findCycle(designEdges);
  if (designCycle) {
    const head = graph.designs.get(designCycle[0]);
    diags.push({
      severity: "error",
      code: "spine/design-cycle",
      message: `v\xF2ng l\u1EB7p thay th\u1EBF gi\u1EEFa c\xE1c design: ${designCycle.join(" \u2192 ")}`,
      file: head.file,
      line: at(graph, head, "supersedes")
    });
  }
  const decisionEdges = /* @__PURE__ */ new Map();
  for (const [id, dec] of graph.decisions) decisionEdges.set(id, dec.value.supersedes);
  const decisionCycle = findCycle(decisionEdges);
  if (decisionCycle) {
    const head = graph.decisions.get(decisionCycle[0]);
    diags.push({
      severity: "error",
      code: "spine/decision-cycle",
      message: `v\xF2ng l\u1EB7p thay th\u1EBF gi\u1EEFa c\xE1c decision: ${decisionCycle.join(" \u2192 ")}`,
      file: head.file,
      line: at(graph, head, "supersedes"),
      hint: `Chu tr\xECnh khi\u1EBFn brief lo\u1EA1i c\u1EA3 c\u1EE5m decision kh\u1ECFi b\xE0n giao \u2014 kh\xF4ng phi\xEAn n\xE0o th\u1EA5y \u0111\u01B0\u1EE3c.`
    });
  }
  const servedGoals = /* @__PURE__ */ new Set();
  for (const d of graph.designs.values()) for (const g of d.value.serves) servedGoals.add(g);
  for (const goal of graph.goals.values()) {
    if (goal.value.status === "active" && !servedGoals.has(goal.value.id)) {
      diags.push({
        severity: "warning",
        code: "spine/goal-without-design",
        message: `goal ${goal.value.id} \u0111ang active nh\u01B0ng ch\u01B0a design n\xE0o ph\u1EE5c v\u1EE5`,
        file: goal.file,
        line: at(graph, goal, "id"),
        hint: `M\u1EE5c ti\xEAu kh\xF4ng c\xF3 \u0111\u01B0\u1EDDng \u0111i t\u1EDBi h\xE0nh \u0111\u1ED9ng th\xEC s\u1EBD kh\xF4ng bao gi\u1EDD \u0111\u1EA1t.`
      });
    }
  }
  for (const fact of graph.facts.values()) {
    const f = fact.value;
    if (f.last_verified_at) {
      const entry = entryAt(graph.ledger, f.id, f.last_verified_at);
      if (!entry) {
        diags.push({
          severity: "error",
          code: "knowledge/unbacked-verification",
          message: `fact ${f.id} khai \u0111\xE3 verify l\xFAc ${f.last_verified_at} nh\u01B0ng s\u1ED5 c\xE1i kh\xF4ng c\xF3 b\u1EA3n ghi n\xE0o kh\u1EDBp \u2014 l\u1EA7n verify \u0111\xF3 KH\xD4NG x\u1EA3y ra`,
          file: fact.file,
          line: at(graph, fact, "last_verified_at"),
          hint: `Ch\u1EC9 \`ganas verify ${f.id}\` m\u1EDBi \u0111\u01B0\u1EE3c \u0111\u1EB7t tr\u01B0\u1EDDng n\xE0y. Xo\xE1 \`last_verified_at\` v\xE0 \`last_result\` r\u1ED3i ch\u1EA1y verify th\u1EADt.`
        });
      } else if (entry.def !== defHash(f.verify, f.statement)) {
        diags.push({
          severity: "error",
          code: "knowledge/definition-changed",
          message: `fact ${f.id}: \u0111\u1ECBnh ngh\u0129a ho\u1EB7c ph\xE1t bi\u1EC3u \u0111\xE3 \u0111\u1ED5i sau l\u1EA7n verify l\xFAc ${f.last_verified_at} \u2014 k\u1EBFt qu\u1EA3 c\u0169 \u0111o m\u1ED9t th\u1EE9 kh\xE1c, kh\xF4ng c\xF2n n\xF3i v\u1EC1 fact hi\u1EC7n t\u1EA1i`,
          file: fact.file,
          line: at(graph, fact, "verify", "run"),
          hint: `Ch\u1EA1y l\u1EA1i: ganas verify ${f.id}`
        });
      } else if (entry.result === "fail" && f.last_result !== "fail") {
        diags.push({
          severity: "error",
          code: "knowledge/result-mismatch",
          message: `fact ${f.id} khai last_result="${f.last_result}" nh\u01B0ng s\u1ED5 c\xE1i ghi l\u1EA7n ch\u1EA1y l\xFAc ${f.last_verified_at} l\xE0 "fail"`,
          file: fact.file,
          line: at(graph, fact, "last_result")
        });
      }
    }
    for (const finding of lintProbe({
      run: f.verify.run,
      statement: f.statement,
      context: [...f.depends_on, ...f.anchors.map(formatAnchor)]
    })) {
      diags.push({
        severity: finding.severity,
        code: `verify/${finding.code === "unrelated" ? "probe-unrelated" : finding.code}`,
        message: `fact ${f.id}: ${finding.message}`,
        file: fact.file,
        line: at(graph, fact, "verify", "run"),
        hint: finding.hint
      });
    }
    const fresh = freshnessOf({ fact: f });
    if (fresh === "never_verified") {
      diags.push({
        severity: "warning",
        code: "knowledge/fact-never-verified",
        message: `fact ${f.id} ch\u01B0a verify l\u1EA7n n\xE0o \u2014 hi\u1EC7n ch\u1EC9 l\xE0 ni\u1EC1m tin, kh\xF4ng ph\u1EA3i s\u1EF1 th\u1EADt`,
        file: fact.file,
        line: at(graph, fact, "id"),
        hint: `Ch\u1EA1y: ganas verify ${f.id}`
      });
    } else if (fresh === "failing") {
      diags.push({
        severity: "error",
        code: "knowledge/fact-failing",
        message: `fact ${f.id} c\xF3 probe fail \u1EDF l\u1EA7n ch\u1EA1y g\u1EA7n nh\u1EA5t \u2014 ph\xE1t bi\u1EC3u n\xE0y \u0111ang SAI`,
        file: fact.file,
        line: at(graph, fact, "verify"),
        hint: `S\u1EEDa l\u1EA1i statement cho kh\u1EDBp th\u1EF1c t\u1EBF, ho\u1EB7c s\u1EEDa code cho kh\u1EDBp statement.`
      });
    }
    if (f.promoted_from && !graph.claims.has(f.promoted_from)) {
      diags.push({
        severity: "warning",
        code: "knowledge/fact-missing-promoted-from",
        message: `fact ${f.id} ghi promoted_from ${f.promoted_from} nh\u01B0ng claim \u0111\xF3 kh\xF4ng c\xF2n`,
        file: fact.file,
        line: at(graph, fact, "promoted_from")
      });
    }
  }
  for (const claim of graph.claims.values()) {
    const c = claim.value;
    const promotedTo = c.verdict?.promoted_to;
    if (promotedTo && !graph.facts.has(promotedTo)) {
      diags.push({
        severity: "error",
        code: "knowledge/claim-missing-promoted-fact",
        message: `claim ${c.id} n\xF3i \u0111\xE3 th\u0103ng c\u1EA5p th\xE0nh fact ${promotedTo} nh\u01B0ng fact \u0111\xF3 kh\xF4ng t\u1ED3n t\u1EA1i`,
        file: claim.file,
        line: at(graph, claim, "verdict", "promoted_to")
      });
    }
    if (c.trust === "refuted") {
      diags.push({
        severity: "info",
        code: "knowledge/claim-refuted",
        message: `claim ${c.id} \u0111\xE3 b\u1ECB b\xE1c b\u1ECF: "${c.statement}"`,
        file: claim.file,
        line: at(graph, claim, "id"),
        hint: `\u0110\xE2y l\xE0 m\u1ED9t hi\u1EC3u nh\u1EA7m \u0111\xE3 t\u1ED3n t\u1EA1i trong d\u1EF1 \xE1n. Gi\u1EEF l\u1EA1i \u0111\u1EC3 phi\xEAn sau kh\xF4ng tin l\u1EA1i.`
      });
    }
  }
  for (const item of graph.icebox.values()) {
    const i = item.value;
    if (i.promoted_to && !graph.tasks.has(i.promoted_to)) {
      diags.push({
        severity: "error",
        code: "icebox/promoted-missing-task",
        message: `icebox ${i.id} khai \u0111\xE3 th\u0103ng c\u1EA5p th\xE0nh task ${i.promoted_to} nh\u01B0ng task \u0111\xF3 kh\xF4ng t\u1ED3n t\u1EA1i`,
        file: item.file,
        line: at(graph, item, "promoted_to"),
        hint: `S\u1EEDa \`promoted_to\` tr\u1ECF \u0111\xFAng id, ho\u1EB7c g\u1EE1 n\xF3 n\u1EBFu ch\u01B0a th\u1EADt s\u1EF1 th\u0103ng c\u1EA5p.`
      });
    }
    if (i.status !== "open") continue;
    const foundAtMs = Date.parse(i.found_at);
    const reviewAfterMs = i.review_after_days * 24 * 60 * 60 * 1e3;
    if (foundAtMs + reviewAfterMs <= now) {
      const daysSince = Math.floor((now - foundAtMs) / (24 * 60 * 60 * 1e3));
      diags.push({
        severity: "warning",
        code: "icebox/review-overdue",
        message: `icebox ${i.id} qu\xE1 h\u1EA1n xem l\u1EA1i: ph\xE1t hi\u1EC7n ${daysSince} ng\xE0y tr\u01B0\u1EDBc, h\u1EB9n xem l\u1EA1i sau ${i.review_after_days} ng\xE0y`,
        file: item.file,
        line: at(graph, item, "review_after_days"),
        hint: `Xem l\u1EA1i quy\u1EBFt \u0111\u1ECBnh ho\xE3n: \u0111\xF3ng n\xF3 (status: closed + closed_reason), th\u0103ng c\u1EA5p th\xE0nh task (status: promoted + promoted_to), ho\u1EB7c n\u1EBFu v\u1EABn c\u1ED1 t\xECnh ho\xE3n ti\u1EBFp th\xEC d\u1EDDi found_at/review_after_days \u2014 \u0111\u1EEBng \u0111\u1EC3 n\xF3 n\u1EB1m im qu\xE1 h\u1EA1n kh\xF4ng ai \u0111\u1ECDc.`
      });
    }
    if (i.scope === void 0) {
      diags.push({
        severity: "warning",
        code: "icebox/without-scope",
        message: `icebox ${i.id} \u0111ang open nh\u01B0ng kh\xF4ng khai \`scope\` \u2014 s\u1EBD r\u01A1i kh\u1ECFi b\u1EA3ng \`ganas debt\` m\u1EB7c \u0111\u1ECBnh c\u1EE7a m\u1ECDi task`,
        file: item.file,
        line: at(graph, item, "id"),
        hint: `Th\xEAm \`scope: <id-ph\u1EA1m-vi>\` n\u1EBFu \u0111\xE3 bi\u1EBFt thu\u1ED9c ph\u1EA1m vi n\xE0o. Thi\u1EBFu n\xF3, m\u1EE5c n\xE0y ch\u1EC9 c\xF2n th\u1EA5y \u0111\u01B0\u1EE3c d\u01B0\u1EDBi \`ganas debt --all\`, kh\xF4ng n\u1EB1m trong b\xE1o c\xE1o sau commit c\u1EE7a ai c\u1EA3.`
      });
    }
  }
  const corrupt = ledgerCorruption(graph.root);
  if (corrupt > 0) {
    diags.push({
      severity: "error",
      code: "knowledge/ledger-corrupt",
      message: `${corrupt} d\xF2ng trong ${LEDGER_FILE} kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c \u2014 s\u1ED5 c\xE1i l\xE0 g\u1ED1c tin c\u1EADy c\u1EE7a m\u1ECDi k\u1EBFt lu\u1EADn "\u0111\xE3 ki\u1EC3m ch\u1EE9ng"`,
      file: `${GANAS_DIR}/${LEDGER_FILE}`,
      hint: `D\xF2ng h\u1ECFng b\u1ECB b\u1ECF qua khi t\xEDnh \u0111\u1ED9 t\u01B0\u01A1i, n\xEAn fact d\u1EF1a v\xE0o ch\xFAng \xE2m th\u1EA7m quay l\u1EA1i "ch\u01B0a verify". Xem git history c\u1EE7a file n\xE0y: m\u1ED9t d\xF2ng r\xE1ch c\xF3 th\u1EC3 l\xE0 l\u1ED7i ghi, c\u0169ng c\xF3 th\u1EC3 l\xE0 d\u1EA5u v\u1EBFt ai \u0111\xF3 s\u1EEDa l\u1ECBch s\u1EED.`
    });
  }
  const chain = verifyChain(graph.ledgerRaw);
  if (!chain.ok) {
    const at2 = graph.ledgerRaw[chain.brokenAt];
    diags.push({
      severity: "error",
      code: "knowledge/ledger-chain-broken",
      message: `${LEDGER_FILE} \u0111\u1EE9t hash-chain t\u1EA1i d\xF2ng th\u1EE9 ${chain.brokenAt + 1}` + (at2 ? ` (target ${at2.target}, ghi l\xFAc ${at2.at})` : "") + ` \u2014 m\u1ED9t d\xF2ng TR\u01AF\u1EDAC \u0111\xF3 \u0111\xE3 b\u1ECB s\u1EEDa, xo\xE1, ho\u1EB7c \u0111\u1EA3o th\u1EE9 t\u1EF1 sau khi ghi.`,
      file: `${GANAS_DIR}/${LEDGER_FILE}`,
      hint: `S\u1ED5 c\xE1i l\xE0 append-only; hash-chain gi\u1EEF d\u1EA5u v\u1EBFt cho M\u1ECCI d\xF2ng sau m\u1ED9t ch\u1ED7 b\u1ECB s\u1EEDa, kh\xF4ng ch\u1EC9 d\xF2ng b\u1ECB s\u1EEDa. Xem git history quanh d\xF2ng n\xE0y \u0111\u1EC3 bi\u1EBFt ai \u0111\u1ED5i g\xEC.`
    });
  }
  if (existsSync4(join3(graph.root, ".git"))) {
    const lines = new Set((graph.gitignoreRaw ?? "").split("\n").map((l) => l.trim()));
    const missing = LOCAL_ONLY.filter((p) => !lines.has(`.ganas/${p}`));
    if (missing.length > 0) {
      diags.push({
        severity: "error",
        code: "spine/gitignore-missing-local",
        message: `.gitignore thi\u1EBFu ${missing.map((p) => `.ganas/${p}`).join(", ")} \u2014 tr\u1EA1ng th\xE1i ri\xEAng c\u1EE7a m\xE1y c\xF3 th\u1EC3 b\u1ECB commit nh\u1EA7m`,
        file: ".gitignore",
        hint: `Th\xEAm c\xE1c d\xF2ng tr\xEAn v\xE0o .gitignore (ho\u1EB7c ch\u1EA1y l\u1EA1i \`ganas init\` \u0111\u1EC3 t\u1EF1 b\u1ED5 sung).`
      });
    }
  }
  return diags;
}
var init_validate = __esm({
  "src/graph/validate.ts"() {
    "use strict";
    init_model();
    init_yaml();
    init_ledger();
    init_lint();
    init_paths();
  }
});

// src/graph/load.ts
var load_exports = {};
__export(load_exports, {
  loadGraph: () => loadGraph
});
import { existsSync as existsSync5 } from "node:fs";
import { readdir, readFile as readFile4 } from "node:fs/promises";
import { join as join4, relative } from "node:path";
function issuesToDiagnostics(loaded, issues, root) {
  return issues.map((issue) => ({
    severity: "error",
    code: `schema/${issue.code}`,
    message: issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    file: relative(root, loaded.file) || loaded.file,
    line: lineOfPath(loaded, issue.path)
  }));
}
function configKeyDiagnostics(loaded, root, configFile) {
  const raw = loaded.value;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];
  const known = new Set(Object.keys(zConfig.shape));
  const file = relative(root, configFile) || configFile;
  const diagnostics = [];
  for (const key of Object.keys(raw)) {
    if (known.has(key)) continue;
    const removed = REMOVED_CONFIG_KEYS[key];
    diagnostics.push({
      severity: "warning",
      code: "spine/config-unknown-key",
      message: removed ? `config.yaml c\xF3 field \`${key}\`: ${removed}` : `config.yaml c\xF3 kho\xE1 l\u1EA1 \`${key}\` \u2014 ganas kh\xF4ng nh\u1EADn ra, c\xF3 th\u1EC3 do g\xF5 sai t\xEAn field.`,
      file,
      line: lineOfPath(loaded, [key]),
      hint: removed ?? `Kho\xE1 h\u1EE3p l\u1EC7: ${[...known].sort().join(", ")}.`
    });
  }
  return diagnostics;
}
async function listYaml(dir) {
  if (!existsSync5(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && (e.name.endsWith(".yaml") || e.name.endsWith(".yml"))).map((e) => join4(dir, e.name)).sort();
}
async function collectSingle(dir, schema, root, kind) {
  const items = /* @__PURE__ */ new Map();
  const diagnostics = [];
  const sources = /* @__PURE__ */ new Map();
  for (const file of await listYaml(dir)) {
    let loaded;
    try {
      loaded = await readYamlFile(file);
    } catch (err) {
      diagnostics.push({
        severity: "error",
        code: "load/yaml",
        message: err instanceof GanasError ? err.message : String(err),
        file: relative(root, file) || file
      });
      continue;
    }
    sources.set(relative(root, file) || file, loaded);
    const parsed = schema.safeParse(loaded.value);
    if (!parsed.success) {
      diagnostics.push(...issuesToDiagnostics(loaded, parsed.error.issues, root));
      continue;
    }
    const value = parsed.data;
    const rel = relative(root, file) || file;
    const existing = items.get(value.id);
    if (existing) {
      diagnostics.push({
        severity: "error",
        code: "load/duplicate-id",
        message: `${kind} ${value.id} khai hai l\u1EA7n (l\u1EA7n tr\u01B0\u1EDBc \u1EDF ${existing.file})`,
        file: rel,
        line: lineOfPath(loaded, ["id"]),
        hint: "M\u1ED7i ID ch\u1EC9 \u0111\u01B0\u1EE3c \u0111\u1ECBnh ngh\u0129a \u1EDF m\u1ED9t file."
      });
      continue;
    }
    items.set(value.id, { value: parsed.data, file: rel });
  }
  return { items, diagnostics, sources };
}
async function collectArray(dirs, schema, root, kind) {
  const items = /* @__PURE__ */ new Map();
  const diagnostics = [];
  const sources = /* @__PURE__ */ new Map();
  for (const dir of dirs) {
    for (const file of await listYaml(dir)) {
      let loaded;
      try {
        loaded = await readYamlFile(file);
      } catch (err) {
        diagnostics.push({
          severity: "error",
          code: "load/yaml",
          message: err instanceof GanasError ? err.message : String(err),
          file: relative(root, file) || file
        });
        continue;
      }
      sources.set(relative(root, file) || file, loaded);
      if (loaded.value === null || loaded.value === void 0) continue;
      const shape = external_exports.array(external_exports.unknown()).safeParse(loaded.value);
      if (!shape.success) {
        diagnostics.push(...issuesToDiagnostics(loaded, shape.error.issues, root));
        continue;
      }
      const rel = relative(root, file) || file;
      shape.data.forEach((element, index) => {
        const parsed = schema.safeParse(element);
        if (!parsed.success) {
          const issues = parsed.error.issues.map((issue) => ({
            ...issue,
            path: [index, ...issue.path]
          }));
          diagnostics.push(...issuesToDiagnostics(loaded, issues, root));
          return;
        }
        const value = parsed.data;
        const existing = items.get(value.id);
        if (existing) {
          diagnostics.push({
            severity: "error",
            code: "load/duplicate-id",
            message: `${kind} ${value.id} khai hai l\u1EA7n (l\u1EA7n tr\u01B0\u1EDBc \u1EDF ${existing.file})`,
            file: rel,
            line: lineOfPath(loaded, [index, "id"]),
            hint: "M\u1ED7i ID ch\u1EC9 \u0111\u01B0\u1EE3c \u0111\u1ECBnh ngh\u0129a \u1EDF m\u1ED9t ch\u1ED7."
          });
          return;
        }
        items.set(value.id, { value: parsed.data, file: rel, index });
      });
    }
  }
  return { items, diagnostics, sources };
}
async function loadGraph(root) {
  const configFile = ganasPath(root, CONFIG_FILE);
  const loadedConfig = await readYamlFile(configFile);
  const parsedConfig = zConfig.safeParse(loadedConfig.value);
  if (!parsedConfig.success) {
    const where = (path) => {
      const line = lineOfPath(loadedConfig, path);
      return `${relative(root, configFile)}${line ? `:${line}` : ""}`;
    };
    const declared = loadedConfig.value?.version;
    if (typeof declared === "number" && declared > LATEST_SCHEMA_VERSION) {
      throw new GanasError(
        `${where(["version"])}: d\u1EF1 \xE1n n\xE0y d\xF9ng schema .ganas v${declared}, b\u1EA3n ganas \u0111ang ch\u1EA1y ch\u1EC9 hi\u1EC3u t\u1EDBi v${LATEST_SCHEMA_VERSION} \u2014 n\xE2ng c\u1EA5p ganas.
  \u0110\u1EEBng h\u1EA1 \`version\` trong config.yaml \u0111\u1EC3 ch\u1EA1y t\u1EA1m: b\u1EA3n c\u0169 s\u1EBD \u0111\u1ECDc sai nh\u1EEFng tr\u01B0\u1EDDng n\xF3 ch\u01B0a bi\u1EBFt.`
      );
    }
    const first = parsedConfig.error.issues[0];
    throw new GanasError(
      `${where(first.path)}: config kh\xF4ng h\u1EE3p l\u1EC7 \u2014 ${first.path.join(".")}: ${first.message}`
    );
  }
  const configDiagnostics = configKeyDiagnostics(loadedConfig, root, configFile);
  const ledgerRaw = await readLedger(root);
  const ledger = indexByTarget(ledgerRaw);
  const gitignoreFile = join4(root, ".gitignore");
  const gitignoreRaw = existsSync5(gitignoreFile) ? await readFile4(gitignoreFile, "utf8") : null;
  const [goals, designs, tasks, scopes, modules, facts, claims, decisions, icebox] = await Promise.all([
    collectSingle(ganasPath(root, DIRS.goals), zGoal, root, "goal"),
    collectSingle(ganasPath(root, DIRS.designs), zDesign, root, "design"),
    collectSingle(ganasPath(root, DIRS.tasks), zTask, root, "task"),
    collectSingle(ganasPath(root, DIRS.scopes), zScope, root, "ph\u1EA1m vi"),
    collectSingle(ganasPath(root, DIRS.modules), zModule, root, "kh\u1ED1i"),
    collectArray([ganasPath(root, DIRS.facts)], zFact, root, "fact"),
    collectArray(
      [ganasPath(root, DIRS.claims), ganasPath(root, DIRS.legacyImported)],
      zClaim,
      root,
      "claim"
    ),
    collectArray([ganasPath(root, DIRS.decisions)], zDecision, root, "decision"),
    collectArray([ganasPath(root, DIRS.icebox)], zIcebox, root, "icebox")
  ]);
  return {
    root,
    config: parsedConfig.data,
    goals: goals.items,
    designs: designs.items,
    tasks: tasks.items,
    scopes: scopes.items,
    modules: modules.items,
    facts: facts.items,
    claims: claims.items,
    decisions: decisions.items,
    icebox: icebox.items,
    ledger,
    ledgerRaw,
    gitignoreRaw,
    sources: new Map([
      ...goals.sources,
      ...designs.sources,
      ...tasks.sources,
      ...scopes.sources,
      ...modules.sources,
      ...facts.sources,
      ...claims.sources,
      ...decisions.sources,
      ...icebox.sources
    ]),
    loadDiagnostics: [
      ...configDiagnostics,
      ...goals.diagnostics,
      ...designs.diagnostics,
      ...tasks.diagnostics,
      ...scopes.diagnostics,
      ...modules.diagnostics,
      ...facts.diagnostics,
      ...claims.diagnostics,
      ...decisions.diagnostics,
      ...icebox.diagnostics
    ]
  };
}
var REMOVED_CONFIG_KEYS;
var init_load = __esm({
  "src/graph/load.ts"() {
    "use strict";
    init_zod();
    init_model();
    init_errors();
    init_yaml();
    init_ledger();
    init_paths();
    REMOVED_CONFIG_KEYS = {
      embedder: "field n\xE0y \u0111\xE3 b\u1ECF \u1EDF v0.3.x, kh\xF4ng c\xF2n t\xE1c d\u1EE5ng \u2014 xo\xE1 d\xF2ng \u0111\xF3 \u0111i cho s\u1EA1ch."
    };
  }
});

// src/util/glob.ts
import { readdir as readdir2 } from "node:fs/promises";
import { join as join5, relative as relative2, sep } from "node:path";
function expandBraces(pattern) {
  const open2 = pattern.indexOf("{");
  if (open2 === -1) return [pattern];
  let depth = 0;
  let close = -1;
  for (let i = open2; i < pattern.length; i++) {
    if (pattern[i] === "{") depth++;
    else if (pattern[i] === "}") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return [pattern];
  const prefix = pattern.slice(0, open2);
  const suffix = pattern.slice(close + 1);
  const body = pattern.slice(open2 + 1, close);
  const parts = [];
  let current = "";
  let nest = 0;
  for (const ch of body) {
    if (ch === "{") nest++;
    else if (ch === "}") nest--;
    if (ch === "," && nest === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.flatMap((p) => expandBraces(prefix + p + suffix));
}
function segmentToRegex(segment) {
  let out = "";
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === "*") {
      out += "[^/]*";
    } else if (ch === "?") {
      out += "[^/]";
    } else if (ch === "[") {
      const close = segment.indexOf("]", i + 1);
      if (close === -1) {
        out += "\\[";
      } else {
        const body = segment.slice(i + 1, close);
        out += `[${body.startsWith("!") ? "^" + body.slice(1) : body}]`;
        i = close;
      }
    } else {
      out += ch.replace(/[.+^${}()|\\]/g, "\\$&");
    }
  }
  return out;
}
function patternToRegex(pattern) {
  const segments = pattern.split("/");
  const parts = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === "**") {
      parts.push(i === segments.length - 1 ? "(?:.*)?" : "(?:.*/)?");
      continue;
    }
    parts.push(segmentToRegex(seg));
    if (i < segments.length - 1 && segments[i + 1] !== "**") parts.push("/");
  }
  return new RegExp(`^${parts.join("")}$`);
}
function matchesAny(path, patterns) {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  for (const pattern of patterns) {
    let regexes = cache.get(pattern);
    if (!regexes) {
      regexes = expandBraces(pattern).map(patternToRegex);
      cache.set(pattern, regexes);
    }
    if (regexes.some((re) => re.test(normalized))) return true;
  }
  return false;
}
async function listProjectFiles(root) {
  const git = await runShell("git ls-files -z --cached --others --exclude-standard", {
    cwd: root,
    timeoutMs: 2e4
  });
  if (git.code === 0 && git.stdout.length > 0) {
    return git.stdout.split("\0").filter(Boolean);
  }
  return walk(root, root, []);
}
async function walk(root, dir, acc) {
  let entries;
  try {
    entries = await readdir2(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join5(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(root, full, acc);
    } else if (entry.isFile()) {
      acc.push(relative2(root, full).split(sep).join("/"));
    }
  }
  return acc;
}
var cache, SKIP_DIRS;
var init_glob = __esm({
  "src/util/glob.ts"() {
    "use strict";
    init_exec();
    cache = /* @__PURE__ */ new Map();
    SKIP_DIRS = /* @__PURE__ */ new Set([
      ".git",
      "node_modules",
      "dist",
      "build",
      "out",
      "target",
      "vendor",
      ".next",
      ".venv",
      "__pycache__",
      ".ganas"
    ]);
  }
});

// src/verify/adapters.ts
import { readFile as readFile5 } from "node:fs/promises";
function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readJsonAdapter(data) {
  if (typeof data !== "object" || data === null) {
    throw new AdapterError("k\u1EBFt qu\u1EA3 kh\xF4ng ph\u1EA3i object JSON");
  }
  const d = data;
  let score = num(d["score"]);
  const passed = num(d["passed"]);
  const failed = num(d["failed"]);
  const n = num(d["n"]) ?? (passed !== void 0 && failed !== void 0 ? passed + failed : void 0);
  if (score === void 0 && passed !== void 0 && n !== void 0 && n > 0) {
    score = passed / n;
  }
  if (score === void 0) {
    throw new AdapterError("thi\u1EBFu `score` (v\xE0 kh\xF4ng suy ra \u0111\u01B0\u1EE3c t\u1EEB `passed`/`n`)");
  }
  if (score < 0 || score > 1) {
    throw new AdapterError(`score = ${score}, ph\u1EA3i n\u1EB1m trong 0..1`);
  }
  return {
    score,
    n,
    passed,
    failed,
    model: typeof d["model"] === "string" ? d["model"] : void 0,
    cost_usd: num(d["cost_usd"])
  };
}
function readPromptfooAdapter(data) {
  const root = data;
  const results = root?.["results"];
  const stats = results?.["stats"] ?? root?.["stats"];
  const successes = num(stats?.["successes"]);
  const failures = num(stats?.["failures"]);
  if (successes === void 0 || failures === void 0) {
    throw new AdapterError("kh\xF4ng t\xECm th\u1EA5y `results.stats.successes` / `.failures`");
  }
  const n = successes + failures;
  if (n === 0) throw new AdapterError("b\u1ED9 eval ch\u1EA1y 0 ca \u2014 kh\xF4ng c\xF3 g\xEC \u0111\u1EC3 ch\u1EA5m");
  const tokenUsage = results?.["tokenUsage"] ?? root?.["tokenUsage"];
  return {
    score: successes / n,
    n,
    passed: successes,
    failed: failures,
    cost_usd: num(tokenUsage?.["cost"])
  };
}
async function readEvalResult(adapter, outFile, stdoutFallback) {
  let raw;
  try {
    raw = await readFile5(outFile, "utf8");
    if (!raw.trim()) throw new Error("r\u1ED7ng");
  } catch {
    raw = stdoutFallback.trim();
    if (!raw) {
      throw new AdapterError(
        `runner kh\xF4ng ghi g\xEC v\xE0o $GANAS_EVAL_OUT v\xE0 c\u0169ng kh\xF4ng in JSON ra stdout`
      );
    }
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new AdapterError("k\u1EBFt qu\u1EA3 kh\xF4ng ph\u1EA3i JSON h\u1EE3p l\u1EC7");
    try {
      data = JSON.parse(match[0]);
    } catch {
      throw new AdapterError("k\u1EBFt qu\u1EA3 kh\xF4ng ph\u1EA3i JSON h\u1EE3p l\u1EC7");
    }
  }
  return adapter === "promptfoo" ? readPromptfooAdapter(data) : readJsonAdapter(data);
}
var AdapterError;
var init_adapters = __esm({
  "src/verify/adapters.ts"() {
    "use strict";
    AdapterError = class extends Error {
    };
  }
});

// src/util/shell.ts
function tokenizeShell(command) {
  const tokens = [];
  let cur = "";
  let started = false;
  let quote3 = null;
  for (const ch of command) {
    if (quote3) {
      if (ch === quote3) quote3 = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote3 = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) tokens.push(cur);
      cur = "";
      started = false;
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) tokens.push(cur);
  return tokens;
}
function stripOperators(token) {
  return token.replace(/^[0-9]*[<>|&;()]+/, "").replace(/[;|&)]+$/, "");
}
function looksLikePath(token) {
  if (!token || token.startsWith("-")) return false;
  return token.includes("/") || /\.[A-Za-z0-9]+$/.test(token);
}
function tokenSpans(command) {
  const spans = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(command)) !== null) spans.push({ text: m[0], start: m.index });
  return spans;
}
var init_shell = __esm({
  "src/util/shell.ts"() {
    "use strict";
  }
});

// src/verify/mutate.ts
function runnerPathSpan(run20) {
  const m = RUNNER.exec(run20);
  if (!m) return null;
  const after = m.index + m[0].length;
  const spans = tokenSpans(run20.slice(after)).map((s) => ({ ...s, start: s.start + after }));
  let skipNext = false;
  for (const span of spans) {
    if (span.text.startsWith("-")) {
      skipNext = VALUE_FLAGS.has(span.text);
      continue;
    }
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (looksLikePath(stripOperators(span.text))) return span;
  }
  return null;
}
function mutateProbe(run20) {
  const fileTest = FILE_TEST.exec(run20);
  if (fileTest) {
    const [full, head, flag2, quote3, path] = fileTest;
    const replaced = `${head}${flag2} ${quote3}${path}${MUTANT_SUFFIX}${quote3}`;
    return {
      run: run20.replace(full, replaced),
      what: `\u0111\u1ED5i \u0111\u01B0\u1EDDng d\u1EABn \`${path}\` th\xE0nh \u0111\u01B0\u1EDDng d\u1EABn kh\xF4ng t\u1ED3n t\u1EA1i`
    };
  }
  const grep = GREP.exec(run20);
  if (grep) {
    const [full, cmd, flags, quote3, pattern] = grep;
    return {
      run: run20.replace(full, `${cmd}${flags} ${quote3}${IMPROBABLE}${quote3}`),
      what: `\u0111\u1ED5i pattern \`${pattern}\` th\xE0nh chu\u1ED7i kh\xF4ng th\u1EC3 kh\u1EDBp`
    };
  }
  const grepBare = GREP_BARE.exec(run20);
  if (grepBare) {
    const [full, cmd, flags, pattern] = grepBare;
    return {
      run: run20.replace(full, `${cmd}${flags} ${IMPROBABLE}`),
      what: `\u0111\u1ED5i pattern \`${pattern}\` th\xE0nh chu\u1ED7i kh\xF4ng th\u1EC3 kh\u1EDBp`
    };
  }
  const runnerPath = runnerPathSpan(run20);
  if (runnerPath) {
    const path = stripOperators(runnerPath.text);
    const replaced = runnerPath.text.replace(path, `${path}${MUTANT_SUFFIX}`);
    return {
      run: run20.slice(0, runnerPath.start) + replaced + run20.slice(runnerPath.start + runnerPath.text.length),
      what: `\u0111\u1ED5i \u0111\u01B0\u1EDDng d\u1EABn \`${path}\` th\xE0nh \u0111\u01B0\u1EDDng d\u1EABn kh\xF4ng t\u1ED3n t\u1EA1i`
    };
  }
  const quoted = QUOTED.exec(run20);
  if (quoted) {
    const [full, quote3, body] = quoted;
    return {
      run: run20.replace(full, `${quote3}${IMPROBABLE}${quote3}`),
      what: `\u0111\u1ED5i chu\u1ED7i \`${body}\` th\xE0nh chu\u1ED7i kh\xF4ng th\u1EC3 kh\u1EDBp`
    };
  }
  return null;
}
async function proveCanFail(run20, expect, opts) {
  const mutation = mutateProbe(run20);
  if (!mutation) {
    return {
      status: "unproven",
      message: `kh\xF4ng nh\u1EADn ra d\u1EA1ng probe \u0111\u1EC3 b\xF3p m\xE9o, n\xEAn ch\u01B0a ch\u1EE9ng minh \u0111\u01B0\u1EE3c n\xF3 c\xF3 th\u1EC3 fail. D\u1EA1ng ki\u1EC3m \u0111\u01B0\u1EE3c: \`test -f <path>\`, \`grep -q '<pattern>' <file>\`, b\u1ED9 ch\u1EA1y test k\xE8m \u0111\u01B0\u1EDDng d\u1EABn (\`bun test <path>\`, \`vitest\`, \`jest\`, \`pytest\`, \`go test\`, \`cargo test\`), ho\u1EB7c l\u1EC7nh c\xF3 chu\u1ED7i trong nh\xE1y.`
    };
  }
  const result = await runShell(mutation.run, {
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs ?? 3e4
  });
  const verdict = judge(result, expect);
  if (verdict.pass) {
    return {
      status: "cannot_fail",
      what: mutation.what,
      message: `b\u1EA3n b\xF3p m\xE9o (${mutation.what}) V\u1EAAN PASS \u2014 probe n\xE0y kh\xF4ng ki\u1EC3m th\u1EE9 n\xF3 n\xF3i l\xE0 \u0111ang ki\u1EC3m.
    b\u1EA3n g\u1ED1c:    ${run20}
    b\xF3p m\xE9o:    ${mutation.run}
    C\u1EA3 hai c\xF9ng pass ngh\u0129a l\xE0 k\u1EBFt qu\u1EA3 pass kh\xF4ng mang th\xF4ng tin g\xEC.`
    };
  }
  return { status: "proven", what: mutation.what };
}
var MUTANT_SUFFIX, IMPROBABLE, FILE_TEST, GREP, GREP_BARE, QUOTED, RUNNER, VALUE_FLAGS;
var init_mutate = __esm({
  "src/verify/mutate.ts"() {
    "use strict";
    init_exec();
    init_shell();
    MUTANT_SUFFIX = ".ganas-mutant";
    IMPROBABLE = "ganas_mutant_zqx7_khong_ton_tai";
    FILE_TEST = /(\[\s+|\btest\s+)(-[fdesr])\s+("?)([^\s"';|&)]+)\3/;
    GREP = /\b(grep|rg|ag)\b((?:\s+-[A-Za-z-]+)*)\s+(['"])((?:(?!\3).)+)\3/;
    GREP_BARE = /\b(grep|rg|ag)\b((?:\s+-[A-Za-z-]+)*)\s+([^\s'"|;&-][^\s|;&]*)/;
    QUOTED = /(['"])((?:(?!\1).){2,})\1/;
    RUNNER = /\b(?:bun\s+test|vitest(?:\s+run)?|jest|pytest|go\s+test|cargo\s+test)\b/;
    VALUE_FLAGS = /* @__PURE__ */ new Set([
      "-c",
      "--config",
      "-p",
      "--project",
      "--rootdir",
      "-k",
      "-t",
      "--testNamePattern",
      "--test-name-pattern",
      "--testPathPattern",
      "-n",
      "--numprocesses",
      "--reporter",
      "-o"
    ]);
  }
});

// src/verify/run.ts
import { mkdtemp, readFile as readFile6, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join6 } from "node:path";
function factTarget(sourced) {
  const f = sourced.value;
  return {
    id: f.id,
    label: f.id,
    kind: "probe",
    definition: f.verify,
    fact: sourced,
    statement: f.statement,
    context: f.depends_on,
    ttlDays: f.ttl_days
  };
}
function moduleTargets(sourced) {
  const m = sourced.value;
  return m.verify.map((v) => ({
    id: `${m.id}/${v.id}`,
    label: `${m.id}/${v.id}`,
    kind: v.kind,
    definition: v,
    verification: v,
    statement: m.title,
    context: [...m.paths, ...m.entrypoints],
    ttlDays: v.ttl_days
  }));
}
function scopeTargets(sourced, graph) {
  const s = sourced.value;
  const context = s.modules.flatMap((id) => {
    const m = graph.modules.get(id)?.value;
    return m ? [...m.paths, ...m.entrypoints] : [];
  });
  return s.acceptance.map((v) => ({
    id: `${s.id}/${v.id}`,
    label: `${s.id}/${v.id}`,
    kind: v.kind,
    definition: v,
    verification: v,
    statement: s.title,
    context,
    ttlDays: v.ttl_days
  }));
}
function scopeOfTarget(target, graph) {
  if (target.fact) return target.fact.value.scope;
  const owner = target.id.split("/")[0];
  if (graph.scopes.has(owner)) return owner;
  return graph.modules.get(owner)?.value.scope;
}
function allTargets(graph) {
  return [
    ...[...graph.facts.values()].map(factTarget),
    ...[...graph.modules.values()].flatMap(moduleTargets),
    ...[...graph.scopes.values()].flatMap((s) => scopeTargets(s, graph))
  ];
}
async function shouldSkip(skipIf, root) {
  if (!skipIf) return false;
  const result = await runShell(skipIf, { cwd: root, timeoutMs: 3e4 });
  return result.code === 0;
}
async function runTarget(target, opts) {
  const { root } = opts;
  if (target.kind === "contract") {
    return { target, result: "unprovable", reason: "ki\u1EC3m t\u01B0\u01A1ng th\xEDch c\u1EA1nh thu\u1ED9c `ganas trace`" };
  }
  const v = target.verification;
  const run20 = target.kind === "eval" ? v.run : target.definition.run;
  const skipIf = v?.skip_if ?? target.definition.skip_if;
  if (target.kind === "probe") {
    const findings = lintProbe({ run: run20, statement: target.statement, context: target.context });
    if (hasBlockingFinding(findings)) {
      const blocking = findings.filter((f) => f.severity === "error");
      return {
        target,
        result: "unprovable",
        reason: blocking.map((f) => f.message).join("; "),
        skipped: true
      };
    }
  }
  if (opts.dryRun) {
    return { target, result: "unprovable", reason: "dry-run: ch\u01B0a ch\u1EA1y", skipped: true };
  }
  if (await shouldSkip(skipIf, root)) {
    const outcome2 = {
      target,
      result: "unavailable",
      reason: `\`skip_if\` kh\u1EDBp \u2014 m\xF4i tr\u01B0\u1EDDng n\xE0y kh\xF4ng ki\u1EC3m \u0111\u01B0\u1EE3c (KH\xD4NG ph\u1EA3i fail)`
    };
    outcome2.entry = await record(target, outcome2, opts);
    return outcome2;
  }
  const outcome = target.kind === "eval" ? await runEval(target, run20, opts) : await runProbe(target, run20, opts);
  outcome.entry = await record(target, outcome, opts);
  if (target.fact && (outcome.result === "pass" || outcome.result === "fail")) {
    await writeBackFact(target.fact, outcome, root);
  }
  return outcome;
}
async function runProbe(target, run20, opts) {
  const def = target.definition;
  const expect = def.expect ?? "exit_zero";
  const result = await runShell(run20, { cwd: opts.root, timeoutMs: def.timeout_ms });
  const verdict = judge(result, expect);
  if (!verdict.pass) {
    return { target, result: "fail", reason: verdict.reason };
  }
  if (opts.skipMutation) return { target, result: "pass" };
  const proof = await proveCanFail(run20, expect, { cwd: opts.root });
  if (proof.status === "cannot_fail") {
    return {
      target,
      result: "unprovable",
      proof: "cannot_fail",
      reason: proof.message
    };
  }
  return {
    target,
    result: "pass",
    proof: proof.status,
    reason: proof.status === "unproven" ? proof.message : void 0
  };
}
async function runEval(target, run20, opts) {
  const v = target.verification;
  const dir = await mkdtemp(join6(tmpdir(), "ganas-eval-"));
  const outFile = join6(dir, "result.json");
  try {
    const result = await runShell(run20, {
      cwd: opts.root,
      timeoutMs: v.timeout_ms ?? 6e5,
      env: { GANAS_EVAL_OUT: outFile }
    });
    let reading;
    try {
      reading = await readEvalResult(v.adapter, outFile, result.stdout);
    } catch (err) {
      const detail = err instanceof AdapterError ? err.message : String(err);
      return {
        target,
        result: "unprovable",
        reason: `kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c k\u1EBFt qu\u1EA3 eval: ${detail}` + (result.code !== 0 ? ` (l\u1EC7nh tho\xE1t m\xE3 ${result.code})` : "")
      };
    }
    const { score } = reading;
    const marginal = score >= v.threshold && score < v.threshold + v.margin;
    return {
      target,
      result: score < v.threshold ? "fail" : marginal ? "marginal" : "pass",
      score,
      costUsd: reading.cost_usd,
      reason: score < v.threshold ? `\u0111i\u1EC3m ${score.toFixed(3)} d\u01B0\u1EDBi ng\u01B0\u1EE1ng ${v.threshold}` + (reading.n ? ` (${reading.passed}/${reading.n} ca \u0111\u1EA1t)` : "") : marginal ? `\u0111i\u1EC3m ${score.toFixed(3)} n\u1EB1m trong v\xF9ng nhi\u1EC5u quanh ng\u01B0\u1EE1ng ${v.threshold} (\xB1${v.margin}) \u2014 ch\u01B0a \u0111\u1EE7 \u0111\u1EC3 g\u1ECDi l\xE0 \u0111\u1EA1t` : void 0
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
async function depsHash(context, root, allProjectFiles) {
  const globs = context.filter((c) => c.includes("*") || c.includes("/"));
  if (globs.length === 0) return void 0;
  const all = allProjectFiles ?? await listProjectFiles(root);
  const files = all.filter((p) => matchesAny(p, globs)).sort();
  const parts = [];
  for (const rel of files) parts.push(`${rel}:${await fileHash(join6(root, rel))}`);
  return sha256(parts.join("\n"));
}
async function record(target, outcome, opts) {
  const ctx = await runContext(opts.root, opts.by);
  const v = target.verification;
  const depsFingerprint = await depsHash(target.context, opts.root);
  const entry = {
    target: target.id,
    kind: target.kind,
    at: (/* @__PURE__ */ new Date()).toISOString(),
    def: defHash(target.definition, target.statement),
    ...depsFingerprint === void 0 ? {} : { deps: depsFingerprint },
    ...outcome.proof === "proven" || outcome.proof === "unproven" ? { proof: outcome.proof } : {},
    result: outcome.result,
    ...ctx
  };
  if (outcome.score !== void 0) entry.score = outcome.score;
  if (outcome.costUsd !== void 0) entry.cost_usd = outcome.costUsd;
  if (v?.kind === "eval") {
    entry.threshold = v.threshold;
    if (v.model) entry.model = v.model;
    if (v.prompt) entry.prompt = await fileHash(join6(opts.root, v.prompt));
    if (v.dataset) entry.dataset = await fileHash(join6(opts.root, v.dataset));
  }
  if (outcome.reason) entry.output = sha256(outcome.reason);
  await appendEntry(opts.root, entry);
  return entry;
}
async function writeBackFact(sourced, outcome, root) {
  const file = join6(root, sourced.file);
  const doc = (0, import_yaml4.parseDocument)(await readFile6(file, "utf8"));
  const base2 = sourced.index === void 0 ? [] : [sourced.index];
  doc.setIn([...base2, "last_verified_at"], outcome.entry.at);
  doc.setIn([...base2, "last_result"], outcome.result === "pass" ? "pass" : "fail");
  doc.setIn([...base2, "verified_by"], outcome.entry.by);
  await writeFile(file, doc.toString(), "utf8");
}
var import_yaml4;
var init_run = __esm({
  "src/verify/run.ts"() {
    "use strict";
    import_yaml4 = __toESM(require_dist(), 1);
    init_exec();
    init_glob();
    init_adapters();
    init_ledger();
    init_lint();
    init_mutate();
  }
});

// src/graph/freshness.ts
var freshness_exports = {};
__export(freshness_exports, {
  computeFreshness: () => computeFreshness,
  freshnessMark: () => freshnessMark
});
import { stat } from "node:fs/promises";
import { join as join7 } from "node:path";
function freshnessMark(state) {
  if (!state) return "\u26A0 [KH\xD4NG R\xD5]";
  if (state.freshness === "fresh") return "\u2713 [FRESH]";
  return `\u26A0 [${state.freshness.toUpperCase()}]`;
}
function decide(args) {
  const { entry, currentDef, current, ttlDays, depsChangedAt, changedFile, depsNow, now } = args;
  if (!entry) {
    return {
      freshness: "never_verified",
      reason: "ch\u01B0a ch\u1EA1y l\u1EA7n n\xE0o \u2014 m\u1EDBi ch\u1EC9 l\xE0 ni\u1EC1m tin",
      action: "ch\u1EA1y `ganas verify`"
    };
  }
  if (entry.def !== currentDef) {
    return {
      freshness: "definition_changed",
      reason: `\u0111\u1ECBnh ngh\u0129a verify \u0111\xE3 \u0111\u1ED5i sau l\u1EA7n ch\u1EA1y ${entry.at.slice(0, 10)} \u2014 k\u1EBFt qu\u1EA3 c\u0169 \u0111o m\u1ED9t ph\xE9p ki\u1EC3m kh\xE1c`,
      action: "ch\u1EA1y l\u1EA1i `ganas verify`"
    };
  }
  if (entry.model !== void 0 && current.model !== void 0 && entry.model !== current.model) {
    return {
      freshness: "model_changed",
      reason: `eval c\u0169 ch\u1EA1y tr\xEAn \`${entry.model}\`, nay khai \`${current.model}\``,
      action: "ch\u1EA1y l\u1EA1i eval tr\xEAn model m\u1EDBi"
    };
  }
  if (entry.prompt !== void 0 && current.prompt !== void 0 && entry.prompt !== current.prompt) {
    return {
      freshness: "prompt_changed",
      reason: `file prompt \u0111\xE3 s\u1EEDa sau l\u1EA7n ch\u1EA1y ${entry.at.slice(0, 10)}`,
      action: "ch\u1EA1y l\u1EA1i eval"
    };
  }
  if (entry.dataset !== void 0 && current.dataset !== void 0 && entry.dataset !== current.dataset) {
    return {
      freshness: "dataset_changed",
      reason: `dataset \u0111\xE3 \u0111\u1ED5i sau l\u1EA7n ch\u1EA1y ${entry.at.slice(0, 10)}`,
      action: "ch\u1EA1y l\u1EA1i eval"
    };
  }
  switch (entry.result) {
    case "fail":
      return {
        freshness: "failing",
        reason: "**l\u1EA7n ch\u1EA1y g\u1EA7n nh\u1EA5t TR\u01AF\u1EE2T \u2014 ph\xE1t bi\u1EC3u n\xE0y \u0111ang SAI**",
        action: "s\u1EEDa code cho kh\u1EDBp ph\xE1t bi\u1EC3u, ho\u1EB7c s\u1EEDa ph\xE1t bi\u1EC3u cho kh\u1EDBp code"
      };
    case "marginal":
      return {
        freshness: "marginal",
        reason: `\u0111i\u1EC3m ${entry.score?.toFixed(3) ?? "?"} n\u1EB1m trong v\xF9ng nhi\u1EC5u quanh ng\u01B0\u1EE1ng ${entry.threshold ?? "?"} \u2014 ch\u01B0a \u0111\u1EE7 \u0111\u1EC3 g\u1ECDi l\xE0 \u0111\u1EA1t`,
        action: "ch\u1EA1y l\u1EA1i, ho\u1EB7c c\u1EA3i thi\u1EC7n t\u1EDBi khi v\u01B0\u1EE3t h\u1EB3n ng\u01B0\u1EE1ng"
      };
    case "unavailable":
      return {
        freshness: "unavailable",
        reason: "m\xF4i tr\u01B0\u1EDDng n\xE0y kh\xF4ng ki\u1EC3m \u0111\u01B0\u1EE3c (`skip_if` kh\u1EDBp) \u2014 **kh\xF4ng ph\u1EA3i l\xE0 fail**",
        action: "ch\u1EA1y \u1EDF n\u01A1i c\xF3 \u0111\u1EE7 ph\u1EE5 thu\u1ED9c, ho\u1EB7c ch\u1EA5p nh\u1EADn l\xE0 ch\u01B0a bi\u1EBFt"
      };
    case "unprovable":
      return {
        freshness: "unprovable",
        reason: "probe ch\u01B0a ch\u1EE9ng minh \u0111\u01B0\u1EE3c l\xE0 c\xF3 th\u1EC3 fail \u2014 k\u1EBFt qu\u1EA3 kh\xF4ng mang th\xF4ng tin",
        action: "vi\u1EBFt l\u1EA1i probe cho n\xF3 th\u1EADt s\u1EF1 ch\u1EA1m v\xE0o \u0111i\u1EC1u \u0111ang kh\u1EB3ng \u0111\u1ECBnh"
      };
  }
  const verifiedAt = Date.parse(entry.at);
  if (entry.deps !== void 0 && depsNow !== void 0) {
    if (entry.deps !== depsNow) {
      return {
        freshness: "stale",
        reason: changedFile ? `\`${changedFile}\` \u0111\xE3 \u0111\u1ED5i sau l\u1EA7n verify g\u1EA7n nh\u1EA5t` : "n\u1ED9i dung file ph\u1EE5 thu\u1ED9c \u0111\xE3 \u0111\u1ED5i sau l\u1EA7n verify g\u1EA7n nh\u1EA5t",
        action: "ch\u1EA1y l\u1EA1i `ganas verify`"
      };
    }
  } else if (depsChangedAt !== void 0 && depsChangedAt > verifiedAt) {
    return {
      freshness: "stale",
      reason: changedFile ? `\`${changedFile}\` \u0111\xE3 \u0111\u1ED5i sau l\u1EA7n verify g\u1EA7n nh\u1EA5t` : "file ph\u1EE5 thu\u1ED9c \u0111\xE3 \u0111\u1ED5i sau l\u1EA7n verify g\u1EA7n nh\u1EA5t",
      action: "ch\u1EA1y l\u1EA1i `ganas verify`"
    };
  }
  if (ttlDays > 0 && now - verifiedAt > ttlDays * 864e5) {
    const days = Math.floor((now - verifiedAt) / 864e5);
    return {
      freshness: "stale",
      reason: `qu\xE1 h\u1EA1n ki\u1EC3m l\u1EA1i (${days} ng\xE0y, h\u1EA1n ${ttlDays} ng\xE0y)`,
      action: "ch\u1EA1y l\u1EA1i `ganas verify`"
    };
  }
  return { freshness: "fresh", reason: `ki\u1EC3m l\u1EA7n cu\u1ED1i ${entry.at.slice(0, 10)}` };
}
async function computeFreshness(graph, opts = {}) {
  const now = opts.now ?? Date.now();
  const targets = allTargets(graph);
  const out = /* @__PURE__ */ new Map();
  const needsFileScan = targets.some((t) => globsOf(t).length > 0);
  const files = needsFileScan ? await listProjectFiles(graph.root) : [];
  const mtimeCache = /* @__PURE__ */ new Map();
  const mtimeOf = async (rel) => {
    const cached = mtimeCache.get(rel);
    if (cached !== void 0) return cached;
    let value = 0;
    try {
      value = (await stat(join7(graph.root, rel))).mtimeMs;
    } catch {
    }
    mtimeCache.set(rel, value);
    return value;
  };
  for (const target of targets) {
    const entry = lastFor(graph.ledger, target.id);
    const globs = globsOf(target);
    let depsChangedAt;
    let changedFile;
    if (globs.length > 0) {
      for (const file of files) {
        if (!matchesAny(file, globs)) continue;
        const m = await mtimeOf(file);
        if (depsChangedAt === void 0 || m > depsChangedAt) {
          depsChangedAt = m;
          changedFile = file;
        }
      }
    }
    const decision = decide({
      entry,
      depsNow: await depsHash(target.context, graph.root, files),
      currentDef: defHash(target.definition, target.statement),
      current: await currentFingerprint(target, graph.root),
      ttlDays: target.ttlDays,
      depsChangedAt,
      changedFile,
      now
    });
    const history = historyFor(graph.ledger, target.id, 5).map((e) => e.score).filter((s) => s !== void 0);
    out.set(target.id, {
      targetId: target.id,
      freshness: decision.freshness,
      reason: decision.reason,
      action: decision.action,
      fact: target.fact?.value,
      lastAt: entry?.at,
      lastScore: entry?.score,
      recentScores: history.length > 1 ? history : void 0
    });
  }
  return out;
}
function globsOf(target) {
  if (target.fact) return target.fact.value.depends_on;
  return target.context.filter((c) => c.includes("*") || c.includes("/"));
}
async function currentFingerprint(target, root) {
  const v = target.verification;
  if (v?.kind !== "eval") return {};
  return {
    model: v.model,
    prompt: v.prompt ? await fileHash(join7(root, v.prompt)) : void 0,
    dataset: v.dataset ? await fileHash(join7(root, v.dataset)) : void 0
  };
}
var init_freshness = __esm({
  "src/graph/freshness.ts"() {
    "use strict";
    init_glob();
    init_ledger();
    init_run();
  }
});

// src/state.ts
var state_exports = {};
__export(state_exports, {
  TOUCHED_PATHS_CAP: () => TOUCHED_PATHS_CAP,
  baselineFor: () => baselineFor,
  bindSession: () => bindSession,
  clearTouched: () => clearTouched,
  dispatchNudgedFor: () => dispatchNudgedFor,
  markDispatchNudged: () => markDispatchNudged,
  markTouched: () => markTouched,
  readState: () => readState,
  releaseSession: () => releaseSession,
  sessionRecord: () => sessionRecord,
  setBaseline: () => setBaseline,
  subagentTouchedFor: () => subagentTouchedFor,
  taskForSession: () => taskForSession,
  touchedPathsFor: () => touchedPathsFor,
  updateState: () => updateState,
  writeState: () => writeState
});
import { existsSync as existsSync6 } from "node:fs";
import { mkdir as mkdir2, readFile as readFile7, rename, writeFile as writeFile2 } from "node:fs/promises";
import { dirname as dirname3 } from "node:path";
async function readState(root) {
  const file = ganasPath(root, STATE_FILE);
  if (!existsSync6(file)) return { ...EMPTY };
  try {
    const parsed = JSON.parse(await readFile7(file, "utf8"));
    return {
      version: 1,
      current_task: parsed.current_task ?? null,
      sessions: parsed.sessions ?? {}
    };
  } catch {
    return { ...EMPTY };
  }
}
async function writeState(root, state) {
  const file = ganasPath(root, STATE_FILE);
  await mkdir2(dirname3(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile2(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  await rename(tmp, file);
}
async function updateState(root, mutate) {
  const state = await readState(root);
  mutate(state);
  await writeState(root, state);
  return state;
}
async function bindSession(root, sessionId, taskId) {
  await updateState(root, (s) => {
    s.sessions[sessionId] = { task: taskId, started_at: (/* @__PURE__ */ new Date()).toISOString() };
    s.current_task = taskId;
  });
}
async function releaseSession(root, sessionId) {
  await updateState(root, (s) => {
    delete s.sessions[sessionId];
  });
}
async function setBaseline(root, sessionId, baseline) {
  await updateState(root, (s) => {
    const rec = s.sessions[sessionId];
    if (rec) rec.baseline = baseline;
  });
}
async function baselineFor(root, sessionId, taskId) {
  if (!sessionId) return void 0;
  const rec = (await readState(root)).sessions[sessionId];
  if (!rec || rec.task !== taskId) return void 0;
  return rec.baseline;
}
async function touchedPathsFor(root, sessionId, taskId) {
  if (!sessionId) return [];
  const rec = (await readState(root)).sessions[sessionId];
  if (!rec || rec.task !== taskId) return [];
  return rec.touched_paths ?? [];
}
async function subagentTouchedFor(root, sessionId, taskId) {
  if (!sessionId) return false;
  const rec = (await readState(root)).sessions[sessionId];
  if (!rec || rec.task !== taskId) return false;
  return rec.subagent_touched === true;
}
async function dispatchNudgedFor(root, sessionId, taskId) {
  if (!sessionId) return false;
  const rec = (await readState(root)).sessions[sessionId];
  if (!rec || rec.task !== taskId) return false;
  return rec.dispatch_nudged === true;
}
async function markDispatchNudged(root, sessionId) {
  await updateState(root, (s) => {
    const rec = s.sessions[sessionId];
    if (rec) rec.dispatch_nudged = true;
  });
}
async function taskForSession(root, sessionId) {
  const state = await readState(root);
  if (sessionId && state.sessions[sessionId]) return state.sessions[sessionId].task;
  return state.current_task;
}
async function sessionRecord(root, sessionId) {
  const state = await readState(root);
  return state.sessions[sessionId] ?? null;
}
async function markTouched(root, sessionId, relPath, fromSubagent) {
  const state = await readState(root);
  const rec = state.sessions[sessionId];
  if (!rec) return;
  let dirty = false;
  if (!rec.touched_at) {
    rec.touched_at = (/* @__PURE__ */ new Date()).toISOString();
    dirty = true;
  }
  if (relPath) {
    const list = rec.touched_paths ??= [];
    if (!list.includes(relPath) && list.length < TOUCHED_PATHS_CAP) {
      list.push(relPath);
      dirty = true;
    }
  }
  if (fromSubagent && !rec.subagent_touched) {
    rec.subagent_touched = true;
    dirty = true;
  }
  if (!dirty) return;
  await writeState(root, state);
}
async function clearTouched(root, sessionId) {
  await updateState(root, (s) => {
    delete s.sessions[sessionId]?.touched_at;
  });
}
var EMPTY, TOUCHED_PATHS_CAP;
var init_state = __esm({
  "src/state.ts"() {
    "use strict";
    init_paths();
    EMPTY = { version: 1, current_task: null, sessions: {} };
    TOUCHED_PATHS_CAP = 200;
  }
});

// src/boundary.ts
var boundary_exports = {};
__export(boundary_exports, {
  contractPathRefs: () => contractPathRefs,
  contractPaths: () => contractPaths,
  formatBoundaryWarning: () => formatBoundaryWarning,
  formatDispatchWarning: () => formatDispatchWarning,
  matchPatterns: () => matchPatterns,
  outsideBoundary: () => outsideBoundary,
  ownsGanasFile: () => ownsGanasFile,
  taskBoundary: () => taskBoundary
});
function contractPathRefs(task) {
  const refs = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (raw, from) => {
    const path = raw.replace(/^\.\//, "");
    if (!path || seen.has(path)) return;
    seen.add(path);
    refs.push({ path, from });
  };
  for (const c of task.exit_contract) {
    if (c.kind === "command") {
      for (const token of tokenizeShell(c.run)) {
        const cleaned = stripOperators(token);
        if (looksLikePath(cleaned)) add(cleaned, `l\u1EC7nh \`${c.run}\``);
      }
    } else if (c.kind === "artifact") {
      add(c.path, `file \`${c.path}\``);
    }
  }
  return refs;
}
function contractPaths(task) {
  return contractPathRefs(task).map((r) => r.path);
}
function taskBoundary(task, graph) {
  const patterns = /* @__PURE__ */ new Set();
  for (const moduleId of task.touches) {
    const mod = graph.modules.get(moduleId)?.value;
    for (const p of mod?.paths ?? []) patterns.add(p);
  }
  for (const p of contractPaths(task)) patterns.add(p);
  return [...patterns];
}
function matchPatterns(boundary) {
  const out = /* @__PURE__ */ new Set();
  for (const raw of boundary) {
    const p = raw.split("\\").join("/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (!p) continue;
    out.add(p);
    if (!GLOB_CHARS.test(p)) out.add(`${p}/**`);
  }
  return [...out];
}
function outsideBoundary(task, graph, touched) {
  const boundary = taskBoundary(task, graph);
  if (boundary.length === 0) return [];
  const patterns = matchPatterns(boundary);
  const out = /* @__PURE__ */ new Set();
  for (const raw of touched) {
    const p = raw.split("\\").join("/").replace(/^\.\//, "");
    if (!p) continue;
    if (p === GANAS_DIR || p.startsWith(`${GANAS_DIR}/`)) continue;
    if (matchesAny(p, patterns)) continue;
    out.add(p);
  }
  return [...out].sort();
}
function formatBoundaryWarning(taskId, boundary, touched, outside) {
  if (outside.length > 0) {
    let out = `
\u26A0 ${outside.length} file phi\xEAn n\xE0y \u0111\xE3 s\u1EEDa n\u1EB1m NGO\xC0I ranh gi\u1EDBi code c\u1EE7a ${taskId}:
` + outside.map((p) => `    ${p}`).join("\n") + `
  Ranh gi\u1EDBi c\u1EE7a ${taskId}: ${boundary.join(", ")}
  (t\u1EEB \`touches\` + \u0111\u01B0\u1EDDng d\u1EABn m\xE0 \`exit_contract\` ch\u1EA1y)
  \`ganas commit\` KH\xD4NG stage nh\u1EEFng file n\xE0y \u2014 ch\xFAng \u1EDF l\u1EA1i working tree,
  kh\xF4ng n\u1EB1m trong commit n\xE0o v\xE0 kh\xF4ng ai nghi\u1EC7m thu.
  Ho\u1EB7c khai th\xEAm kh\u1ED1i v\xE0o \`touches\`, ho\u1EB7c t\xE1ch ph\u1EA7n l\u1EA1c ra task ri\xEAng.
`;
    if (touched.length >= TOUCHED_PATHS_CAP) {
      out += `  (\u0111\xE3 ghi t\u1ED1i \u0111a ${TOUCHED_PATHS_CAP} \u0111\u01B0\u1EDDng d\u1EABn \u2014 c\xF3 th\u1EC3 c\xF2n file kh\xE1c.)
`;
    }
    return out;
  }
  if (boundary.length === 0 && touched.length > 0) {
    return `
\u26A0 ${taskId} ch\u01B0a khai \`touches\` v\xE0 \`exit_contract\` kh\xF4ng nh\u1EAFc \u0111\u01B0\u1EDDng d\u1EABn n\xE0o,
  n\xEAn KH\xD4NG c\xF3 ranh gi\u1EDBi code \u0111\u1EC3 \u0111\u1ED1i chi\u1EBFu \u2014 ${touched.length} file \u0111\xE3 s\u1EEDa \u0111i qua m\xE0 kh\xF4ng
  ai ki\u1EC3m \u0111\u01B0\u1EE3c ch\xFAng c\xF3 thu\u1ED9c task n\xE0y kh\xF4ng.
`;
  }
  return "";
}
function formatDispatchWarning(taskId, tier, subagentTouched) {
  if (tier !== "scribe" && tier !== "verifier") return "";
  if (subagentTouched) return "";
  return `
\u26A0 ${taskId} khai tier \`${tier}\` nh\u01B0ng c\u1EA3 phi\xEAn kh\xF4ng c\xF3 l\u01B0\u1EE3t s\u1EEDa n\xE0o t\u1EEB sub-agent \u2014
  c\xF3 v\u1EBB phi\xEAn ch\xEDnh (model m\u1EA1nh nh\u1EA5t) \u0111\xE3 t\u1EF1 l\xE0m vi\u1EC7c c\u01A1 h\u1ECDc/ki\u1EC3m ch\u1EE9ng thay v\xEC giao vi\u1EC7c.
  Xem m\u1EE5c "Giao vi\u1EC7c" trong brief \u0111\u1EC3 giao \u0111\xFAng cho sub-agent.
`;
}
function ownsGanasFile(task, relPath) {
  const p = relPath.split("\\").join("/").replace(/^\.\//, "");
  const prefix = `${GANAS_DIR}/`;
  if (!p.startsWith(prefix)) return false;
  const inner = p.slice(prefix.length);
  if (inner === LEDGER_FILE) return true;
  const stem = inner.replace(YAML_EXT, "");
  return stem === `${DIRS.tasks}/${task.id}` || stem === `${DIRS.designs}/${task.implements}` || stem === `${DIRS.scopes}/${task.scope}` || task.serves.some((g) => stem === `${DIRS.goals}/${g}`) || task.touches.some((m) => stem === `${DIRS.modules}/${m}`) || task.context_contract.facts.some((f) => stem === `${DIRS.facts}/${f}`);
}
var GLOB_CHARS, YAML_EXT;
var init_boundary = __esm({
  "src/boundary.ts"() {
    "use strict";
    init_paths();
    init_state();
    init_glob();
    init_shell();
    init_ledger();
    GLOB_CHARS = /[*?[\]{}]/;
    YAML_EXT = /\.ya?ml$/;
  }
});

// src/flow.ts
function unverifiedModules(c) {
  if (!c.graph) return [];
  return [...c.graph.modules.values()].filter((m) => m.value.scope !== void 0 && m.value.verify.length === 0).map((m) => m.value.id);
}
function needsVerify(c) {
  if (!c.task || !c.graph) return [];
  const out = [];
  for (const criterion of c.task.exit_contract) {
    if (criterion.kind !== "verification") continue;
    const state = c.freshness.get(criterion.target);
    if (!state || state.freshness !== "fresh") out.push(criterion.target);
  }
  return out;
}
function nextStep(c) {
  for (const [i, stage] of STAGES.entries()) {
    if (stage.done(c)) continue;
    return {
      stage,
      action: stage.action(c),
      command: stage.command?.(c),
      template: stage.template?.(c),
      at: i + 1,
      total: STAGES.length
    };
  }
  return null;
}
async function flowContext(cwd) {
  const root = findGanasRoot(cwd);
  if (!root) {
    return {
      root: null,
      graph: null,
      freshness: /* @__PURE__ */ new Map(),
      task: null,
      boundTask: null,
      gate: null,
      dirty: false
    };
  }
  const { loadGraph: loadGraph2 } = await Promise.resolve().then(() => (init_load(), load_exports));
  const { computeFreshness: computeFreshness2 } = await Promise.resolve().then(() => (init_freshness(), freshness_exports));
  const { runShell: runShell2 } = await Promise.resolve().then(() => (init_exec(), exec_exports));
  const graph = await loadGraph2(root);
  const freshness = await computeFreshness2(graph);
  const picked = selectNextTask(graph);
  const task = picked?.task.value ?? null;
  const gate = task ? await evaluateGate(graph, task, freshness) : null;
  const { taskBoundary: taskBoundary2 } = await Promise.resolve().then(() => (init_boundary(), boundary_exports));
  const paths = task ? [...taskBoundary2(task, graph), ".ganas"] : [".ganas"];
  const spec = paths.map((p) => JSON.stringify(p)).join(" ");
  const status = await runShell2(`git status --porcelain -- ${spec}`, {
    cwd: root,
    timeoutMs: 5e3
  });
  const dirty = status.code === 0 && status.stdout.trim().length > 0;
  const { readState: readState2 } = await Promise.resolve().then(() => (init_state(), state_exports));
  const boundTask = (await readState2(root)).current_task;
  return { root, graph, freshness, task, boundTask, gate, dirty };
}
var activeGoals, servingDesigns, STAGES;
var init_flow = __esm({
  "src/flow.ts"() {
    "use strict";
    init_gate();
    init_paths();
    init_select();
    init_validate();
    activeGoals = (g) => [...g.goals.values()].filter((x) => x.value.status === "active");
    servingDesigns = (g) => [...g.designs.values()].filter(
      (d) => d.value.status !== "archived" && d.value.serves.some((id) => g.goals.has(id))
    );
    STAGES = [
      {
        id: "init",
        why: "Ch\u01B0a c\xF3 `.ganas/` th\xEC kh\xF4ng c\xF3 g\xEC \u0111\u1EC3 neo tri th\u1EE9c v\xE0o.",
        done: (c) => c.root !== null,
        action: () => "Kh\u1EDFi t\u1EA1o ganas cho d\u1EF1 \xE1n n\xE0y",
        command: () => "ganas init"
      },
      {
        id: "fix-graph",
        why: "Graph h\u1ECFng th\xEC m\u1ECDi k\u1EBFt lu\u1EADn ph\xEDa sau \u0111\u1EC1u kh\xF4ng tin \u0111\u01B0\u1EE3c \u2014 s\u1EEDa tr\u01B0\u1EDBc, \u0111\u1EEBng \u0111i ti\u1EBFp.",
        done: (c) => !c.graph || validateGraph(c.graph).every((d) => d.severity !== "error"),
        action: (c) => {
          const errs = c.graph ? validateGraph(c.graph).filter((d) => d.severity === "error") : [];
          const first = errs[0];
          if (!first) return "S\u1EEDa l\u1ED7i trong graph";
          const where = first.line === void 0 ? first.file : `${first.file}:${first.line}`;
          return `S\u1EEDa ${errs.length} l\u1ED7i trong graph. L\u1ED7i \u0111\u1EA7u ti\xEAn:
    ${where}
    ${first.message}` + (first.hint ? `
    \u2192 ${first.hint}` : "");
        },
        command: () => "ganas validate"
      },
      {
        id: "scope",
        why: "Ph\u1EA1m vi l\xE0 ranh gi\u1EDBi c\u1EE7a c\u1EA3 vi\u1EC7c l\u1EABn tri th\u1EE9c. Task v\xE0 fact \u0111\u1EC1u ph\u1EA3i thu\u1ED9c v\u1EC1 m\u1ED9t c\xE1i.",
        done: (c) => !c.graph || c.graph.scopes.size > 0,
        action: () => "D\u1ECBch y\xEAu c\u1EA7u th\xE0nh m\u1ED9t ph\u1EA1m vi c\xF4ng vi\u1EC7c (4 c\xE2u)",
        command: () => "ganas scope new"
      },
      {
        id: "goal",
        why: "Kh\xF4ng c\xF3 m\u1EE5c ti\xEAu \u0111o \u0111\u01B0\u1EE3c th\xEC kh\xF4ng c\xF3 c\xE1ch n\xE0o bi\u1EBFt vi\u1EC7c \u0111ang l\xE0m c\xF3 \u0111\xE1ng l\xE0m kh\xF4ng.",
        done: (c) => !c.graph || activeGoals(c.graph).length > 0,
        action: () => "S\u1EEDa `.ganas/goals/G-001.yaml` th\xE0nh m\u1EE5c ti\xEAu th\u1EADt, r\u1ED3i cho ng\u01B0\u1EDDi duy\u1EC7t",
        template: () => `# .ganas/goals/G-001.yaml
title: "<k\u1EBFt qu\u1EA3 ng\u01B0\u1EDDi d\xF9ng c\u1EA3m nh\u1EADn \u0111\u01B0\u1EE3c>"
outcome: "<h\u1ECD th\u1EA5y g\xEC kh\xE1c \u0111i sau khi vi\u1EC7c n\xE0y xong>"
acceptance:
  - id: A-1
    kind: command
    run: "<l\u1EC7nh ch\u1EA5m \u0111\u01B0\u1EE3c c\xF3/kh\xF4ng>"
status: active
approved_by: "@<ten-nguoi-duyet>"   # model KH\xD4NG \u0111\u01B0\u1EE3c t\u1EF1 ch\u1ED1t m\u1EE5c ti\xEAu
approved_at: <ISO date>`
      },
      {
        id: "design",
        why: "Design l\xE0 ch\u1ED7 ghi V\xCC SAO ch\u1ECDn c\xE1ch n\xE0y. Kh\xF4ng c\xF3 n\xF3, phi\xEAn sau \u0111\u1EC1 xu\u1EA5t l\u1EA1i \u0111\xFAng c\xE1i \u0111\xE3 b\u1ECB lo\u1EA1i.",
        done: (c) => !c.graph || servingDesigns(c.graph).length > 0,
        action: (c) => `Vi\u1EBFt m\u1ED9t design ph\u1EE5c v\u1EE5 ${c.graph ? activeGoals(c.graph)[0]?.value.id : "goal"}`,
        template: (c) => `# .ganas/designs/D-001.yaml
id: D-001
title: "<c\xE1ch ti\u1EBFp c\u1EADn, m\u1ED9t c\xE2u>"
serves: [${c.graph ? activeGoals(c.graph)[0]?.value.id ?? "G-001" : "G-001"}]
summary: "<c\xE1ch l\xE0m, v\xE0 v\xEC sao ch\u1ECDn n\xF3 thay v\xEC ph\u01B0\u01A1ng \xE1n kh\xE1c>"
status: active`
      },
      {
        id: "evidence",
        why: "Task khai `touches` ph\u1EA3i tr\u1ECF v\xE0o m\u1ED9t b\u1EB1ng ch\u1EE9ng C\xD3 TH\u1EACT c\u1EE7a kh\u1ED1i. Kh\u1ED1i `verify: []` th\xEC kh\xF4ng c\xF3 g\xEC \u0111\u1EC3 tr\u1ECF, v\xE0 `ganas scope new` c\u1ED1 \xFD t\u1EA1o kh\u1ED1i r\u1ED7ng \u2014 n\xF3 kh\xF4ng \u0111o\xE1n h\u1ED9 c\xE1ch ki\u1EC3m v\xF9ng code c\u1EE7a b\u1EA1n.",
        done: (c) => !c.graph || unverifiedModules(c).length === 0,
        action: (c) => `Th\xEAm b\u1EB1ng ch\u1EE9ng cho kh\u1ED1i: ${unverifiedModules(c).join(", ")}`,
        template: (c) => {
          const id = unverifiedModules(c)[0] ?? "M-x";
          const mod = c.graph?.modules.get(id)?.value;
          const llm = mod?.nature === "llm";
          return `# .ganas/modules/${id}.yaml \u2014 th\xEAm v\xE0o cu\u1ED1i
verify:
  - id: V-${id.replace(/^M-/, "")}-smoke
    kind: ${llm ? "eval" : "probe"}
    run: "<l\u1EC7nh ki\u1EC3m v\xF9ng code n\xE0y>"${llm ? `
    adapter: json
    threshold: 0.8
# nature: llm \u21D2 B\u1EAET BU\u1ED8C eval: probe ki\u1EC3m \u0111\u01B0\u1EE3c c\u1EA5u tr\xFAc,
# kh\xF4ng ki\u1EC3m \u0111\u01B0\u1EE3c h\xE0nh vi c\u1EE7a LLM.` : ""}`;
        }
      },
      {
        id: "task",
        why: "Task l\xE0 \u0111\u01A1n v\u1ECB v\u1EEBa m\u1ED9t phi\xEAn. Kh\xF4ng c\xF3 task th\xEC phi\xEAn kh\xF4ng bi\u1EBFt b\u1EAFt \u0111\u1EA7u t\u1EEB \u0111\xE2u.",
        done: (c) => !c.graph || selectNextTask(c.graph) !== null,
        action: () => "Vi\u1EBFt m\u1ED9t task l\xE0m \u0111\u01B0\u1EE3c ngay trong phi\xEAn t\u1EDBi",
        template: (c) => {
          const g = c.graph;
          const scope = g ? [...g.scopes.values()][0]?.value : void 0;
          const mod = scope?.modules[0] ?? "M-x";
          return `# .ganas/tasks/T-001.yaml
id: T-001
title: "<vi\u1EC7c c\u1EE5 th\u1EC3, l\xE0m xong trong m\u1ED9t phi\xEAn>"
serves: [${g ? activeGoals(g)[0]?.value.id ?? "G-001" : "G-001"}]
implements: ${g ? servingDesigns(g)[0]?.value.id ?? "D-001" : "D-001"}
scope: ${scope?.id ?? "P-x"}
status: todo
touches: [${mod}]
exit_contract:
  # Ch\u1EA1m kh\u1ED1i n\xE0o th\xEC ph\u1EA3i \u0111\u1EC3 l\u1EA1i b\u1EB1ng ch\u1EE9ng cho kh\u1ED1i \u0111\xF3.
  - kind: verification
    target: ${mod}/<V-id-b\u1EB1ng-ch\u1EE9ng>`;
        }
      },
      {
        id: "work",
        why: "Brief n\u1EA1p \u0111\xFAng ng\u1EEF c\u1EA3nh c\u1EE7a task: ph\u1EA1m vi, m\u1EE5c ti\xEAu, tri th\u1EE9c d\xF9ng \u0111\u01B0\u1EE3c v\xE0 tri th\u1EE9c ph\u1EA3i ki\u1EC3m l\u1EA1i.",
        // Xong = đã MỞ brief cho đúng task này (`ganas next` ghim task vào state).
        // KHÔNG dùng "bằng chứng đã tươi" — đó là điều kiện của chặng `verify`, và
        // hai chặng dùng chung một điều kiện thì chặng trước không bao giờ vượt
        // được bằng chính việc nó bảo làm. Mỗi chặng phải qua được bởi hành động
        // của chính nó, nếu không dòng chảy kẹt.
        done: (c) => c.task === null || c.boundTask === c.task.id,
        action: () => "M\u1EDF phi\xEAn v\xE0 l\xE0m task \u2014 \u0111\u1ECDc brief tr\u01B0\u1EDBc, \u0111\u1EEBng \u0111o\xE1n",
        command: () => "ganas next"
      },
      {
        id: "verify",
        why: "B\u1EB1ng ch\u1EE9ng c\u0169 kh\xF4ng n\xF3i v\u1EC1 code hi\u1EC7n t\u1EA1i. `gate` ch\u1EC9 \u0110\u1ECCC s\u1ED5 c\xE1i, n\xF3 kh\xF4ng t\u1EF1 ch\u1EA1y l\u1EA1i gi\xFAp.",
        done: (c) => needsVerify(c).length === 0,
        action: (c) => `Ch\u1EA1y l\u1EA1i b\u1EB1ng ch\u1EE9ng: ${needsVerify(c).join(", ")}`,
        command: (c) => `ganas verify ${needsVerify(c).join(" ")}`
      },
      {
        id: "gate",
        why: '"Xong" l\xE0 th\u1EE9 ch\u1EA5m \u0111\u01B0\u1EE3c, kh\xF4ng ph\u1EA3i c\u1EA3m gi\xE1c.',
        done: (c) => c.gate === null || c.gate.ok,
        action: () => "C\xF2n ti\xEAu ch\xED ho\xE0n th\xE0nh ch\u01B0a \u0111\u1EA1t \u2014 s\u1EEDa ti\u1EBFp r\u1ED3i ch\u1EA5m l\u1EA1i",
        command: () => "ganas gate"
      },
      {
        id: "commit",
        why: "Commit message d\u1EF1ng t\u1EEB d\u1EEF li\u1EC7u \u0111\xE3 ki\u1EC3m ch\u1EE9ng, kh\xF4ng ph\u1EA3i t\u1EEB tr\xED nh\u1EDB.",
        done: (c) => !c.dirty,
        action: () => "Commit task \u0111\xE3 \u0111\u1EA1t gate",
        command: () => "ganas commit"
      },
      {
        id: "close",
        why: "Task ch\u01B0a \u0111\xE1nh d\u1EA5u `done` th\xEC phi\xEAn sau v\u1EABn ch\u1ECDn l\u1EA1i n\xF3.",
        done: (c) => c.task === null || c.task.status === "done",
        action: (c) => `\u0110\xE1nh d\u1EA5u ${c.task?.id ?? "task"} xong trong YAML: \`status: done\` + \`done_at\``
      }
    ];
  }
});

// src/commands/flow.ts
var flow_exports = {};
__export(flow_exports, {
  run: () => run
});
async function run(argv) {
  const cwd = option(argv, "root") ?? process.cwd();
  const ctx = await flowContext(cwd);
  const step = nextStep(ctx);
  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          stage: step?.stage.id ?? null,
          action: step?.action ?? null,
          command: step?.command ?? null,
          at: step?.at ?? STAGES.length,
          total: STAGES.length,
          stages: STAGES.map((s) => ({ id: s.id, done: s.done(ctx) }))
        },
        null,
        2
      ) + "\n"
    );
    return 0;
  }
  if (flag(argv, "all")) {
    process.stdout.write("D\xF2ng ch\u1EA3y \u2014 ch\u1EB7ng \u0111\u1EA7u ti\xEAn ch\u01B0a xong l\xE0 b\u01B0\u1EDBc k\u1EBF ti\u1EBFp:\n\n");
    for (const s of STAGES) {
      const mark = s.done(ctx) ? "\u2713" : step?.stage.id === s.id ? "\u2192" : " ";
      process.stdout.write(`  ${mark} ${s.id}
`);
    }
    process.stdout.write("\n");
  }
  if (!step) {
    process.stdout.write(
      `\u2713 M\u1ECDi ch\u1EB7ng \u0111\u1EC1u xong cho task hi\u1EC7n t\u1EA1i.

V\xF2ng ti\u1EBFp theo b\u1EAFt \u0111\u1EA7u b\u1EB1ng m\u1ED9t task m\u1EDBi \u2014 vi\u1EBFt v\xE0o .ganas/tasks/ r\u1ED3i ch\u1EA1y l\u1EA1i \`ganas\`.
`
    );
    return 0;
  }
  process.stdout.write(
    `B\u01B0\u1EDBc k\u1EBF ti\u1EBFp (${step.at}/${step.total} \xB7 ${step.stage.id})

  ${step.action}

  V\xEC sao: ${step.stage.why}
`
  );
  if (step.command) {
    process.stdout.write(`
  Ch\u1EA1y:
    ${step.command}
`);
  }
  if (step.template) {
    process.stdout.write(
      `
  Ch\u01B0a c\xF3 l\u1EC7nh cho b\u01B0\u1EDBc n\xE0y \u2014 vi\u1EBFt tay. Khung d\xE1n \u0111\u01B0\u1EE3c:

` + step.template.split("\n").map((l) => `    ${l}`).join("\n") + "\n"
    );
  }
  process.stdout.write(`
  Xem to\xE0n b\u1ED9 ch\u1EB7ng: ganas flow --all
`);
  return 0;
}
var init_flow2 = __esm({
  "src/commands/flow.ts"() {
    "use strict";
    init_flow();
    init_args();
  }
});

// src/templates/project.ts
function configYaml(v) {
  return `# ganas \u2014 c\u1EA5u h\xECnh d\u1EF1 \xE1n
version: 1
project: ${JSON.stringify(v.project)}

# M\u1EE9c c\u01B0\u1EE1ng ch\u1EBF c\u1EE7a hook.
#   warn    \u2014 ch\u1EC9 c\u1EA3nh b\xE1o, kh\xF4ng ch\u1EB7n (shadow mode; h\u1EE3p khi m\u1EDBi b\u1EAFt \u0111\u1EA7u)
#   enforce \u2014 ch\u1EB7n thao t\xE1c sai
# D\u1EF1 \xE1n m\u1EDBi b\u1EAFt \u0111\u1EA7u b\u1EB1ng enforce lu\xF4n: ch\u01B0a c\xF3 th\xF3i quen c\u0169 n\xE0o \u0111\u1EC3 ph\xE1.
enforcement: enforce

# B\u1EADt/t\u1EAFt ri\xEAng t\u1EEBng lu\u1EADt khi c\u1EA7n n\u1EDBi \u1EDF m\u1ED9t ch\u1ED7 m\xE0 v\u1EABn gi\u1EEF ch\u1EB7t ch\u1ED7 kh\xE1c.
enforcement_rules: {}
  # knowledge_anchor: enforce
  # schema: enforce
  # exit_contract: enforce
  # task_link: enforce

# Harness giao vi\u1EC7c: claude-code | cursor | zed | windsurf | other
# Quy\u1EBFt \u0111\u1ECBnh brief h\u01B0\u1EDBng d\u1EABn giao task ki\u1EC3u n\xE0o: claude-code th\xEC t\u1EA1o sub-agent
# v\u1EDBi model c\u1EE7a tier; c\xE1c harness c\xF2n l\u1EA1i ch\u1EC9 n\u1ED1i qua MCP n\xEAn brief ch\u1EC9 khuy\u1EBFn
# ngh\u1ECB \u0111\u1ED5i model trong picker. Repo m\u1EDF b\u1EB1ng nhi\u1EC1u editor th\xEC khai c\xE1i b\u1EA1n th\u1EADt
# s\u1EF1 giao vi\u1EC7c t\u1EEB \u0111\xF3.
harness: claude-code

# Model th\u1EADt cho t\u1EEBng tier. Task khai \`model: <tier>\` l\xFAc ch\u1EBB, brief tra \u1EDF \u0111\xE2y.
#   main     \u2014 vi\u1EC7c kh\xF3/m\u01A1 h\u1ED3, c\u1EA7n ph\xE1n \u0111o\xE1n
#   verifier \u2014 kho\u1EA3ng gi\u1EEFa
#   scribe   \u2014 vi\u1EC7c c\u01A1 h\u1ECDc, \xEDt quy\u1EBFt \u0111\u1ECBnh (tier th\u1EA5p \u0111\u1EC3 \u0111\u1EE1 ngh\u0129 qu\xE1 tay)
models:
  main: claude-opus-5
  verifier: claude-sonnet-5
  scribe: claude-haiku-4-5
`;
}
function claudeMd(v) {
  return `# ${v.project}

D\u1EF1 \xE1n n\xE0y d\xF9ng **ganas** \u0111\u1EC3 ki\u1EC3m so\xE1t phi\xEAn l\xE0m vi\u1EC7c. Tr\u1EA1ng th\xE1i c\xF4ng vi\u1EC7c v\xE0 tri
th\u1EE9c \u0111\xE3 ki\u1EC3m ch\u1EE9ng n\u1EB1m \u1EDF \`.ganas/\`, kh\xF4ng n\u1EB1m trong \u0111\u1EA7u b\u1EA1n v\xE0 kh\xF4ng n\u1EB1m trong
file t\u1ED5ng k\u1EBFt t\u1EF1 do.

## B\u1EAFt \u0111\u1EA7u m\u1ED9t phi\xEAn

Brief c\u1EE7a task hi\u1EC7n t\u1EA1i \u0111\u01B0\u1EE3c b\u01A1m t\u1EF1 \u0111\u1ED9ng l\xFAc m\u1EDF phi\xEAn. N\u1EBFu kh\xF4ng th\u1EA5y, ch\u1EA1y:

\`\`\`
ganas next
\`\`\`

## Lu\u1EADt quan tr\u1ECDng nh\u1EA5t

\u0110\u1ECDc \`.claude/rules/ganas-knowledge.md\`. T\xF3m t\u1EAFt m\u1ED9t d\xF2ng: **kh\xF4ng c\xF3 b\u1EB1ng ch\u1EE9ng
th\xEC kh\xF4ng \u0111\u01B0\u1EE3c ghi v\xE0o kho tri th\u1EE9c**.

Ki\u1EBFn tr\xFAc: \u0111\u1ECDc \`.claude/rules/architecture.md\` \u2014 t\xE1ch l\xF5i nghi\u1EC7p v\u1EE5 kh\u1ECFi I/O.

## L\u1EC7nh hay d\xF9ng

| L\u1EC7nh | Vi\u1EC7c |
|---|---|
| \`ganas next\` | Task k\u1EBF ti\u1EBFp + brief \u0111\u1EA7y \u0111\u1EE7 |
| \`ganas validate\` | Ki\u1EC3m tra graph tr\u01B0\u1EDBc khi commit |
| \`ganas verify <id>\` | Ch\u1EA1y probe c\u1EE7a m\u1ED9t fact |
| \`ganas gate\` | Ch\u1EA5m \u0111i\u1EC1u ki\u1EC7n ho\xE0n th\xE0nh c\u1EE7a task \u0111ang l\xE0m |
| \`ganas commit\` | Commit task \u0111\xE3 \u0111\u1EA1t gate \u2014 ch\u1EC9 khi th\u1EADt s\u1EF1 xong |

<!-- Gi\u1EEF file n\xE0y d\u01B0\u1EDBi ~200 d\xF2ng. Quy tr\xECnh nhi\u1EC1u b\u01B0\u1EDBc \u2192 chuy\u1EC3n th\xE0nh skill.
     Lu\u1EADt theo v\xF9ng code \u2192 chuy\u1EC3n th\xE0nh .claude/rules/*.md c\xF3 \`paths:\`. -->
`;
}
function knowledgeRuleMd() {
  return `# Lu\u1EADt ghi tri th\u1EE9c (ganas)

Kho tri th\u1EE9c c\u1EE7a d\u1EF1 \xE1n n\u1EB1m \u1EDF \`.ganas/\`. M\u1ECDi th\u1EE9 ghi v\xE0o \u0111\xF3 \u0111\u1EC1u thu\u1ED9c \u0111\xFAng m\u1ED9t
trong ba lo\u1EA1i. Ghi sai lo\u1EA1i l\xE0 l\u1ED7i nghi\xEAm tr\u1ECDng h\u01A1n l\xE0 kh\xF4ng ghi.

## Ba lo\u1EA1i, kh\xF4ng c\xF3 lo\u1EA1i th\u1EE9 t\u01B0

**FACT** \u2014 \u0111i\u1EC1u ki\u1EC3m ch\u1EE9ng \u0111\u01B0\u1EE3c b\u1EB1ng l\u1EC7nh.
B\u1EAFt bu\u1ED9c c\xF3 \`verify.run\` (l\u1EC7nh shell ch\u1EA1y \u0111\u01B0\u1EE3c) v\xE0 \`verify.expect\`. Phi\xEAn sau
\u0111\u01B0\u1EE3c ph\xE9p tin, nh\u01B0ng ch\u1EC9 khi fact c\xF2n FRESH.

**CLAIM** \u2014 \u0111i\u1EC1u \u0111\u01B0\u1EE3c tin nh\u01B0ng ch\u01B0a ki\u1EC3m ch\u1EE9ng.
B\u1EAFt bu\u1ED9c c\xF3 \`anchors\` kh\xF4ng r\u1ED7ng. Phi\xEAn sau \u0111\u1ED1i x\u1EED nh\u01B0 **gi\u1EA3 thuy\u1EBFt**: mu\u1ED1n d\u1EF1a
v\xE0o th\xEC ph\u1EA3i verify tr\u01B0\u1EDBc, r\u1ED3i ghi l\u1EA1i k\u1EBFt qu\u1EA3.

**DECISION** \u2014 \u0111i\u1EC1u ng\u01B0\u1EDDi \u0111\xE3 ch\u1ED1t.
B\u1EAFt bu\u1ED9c c\xF3 \`decided_by\` v\xE0 \`decided_at\`. B\u1EA1n **kh\xF4ng \u0111\u01B0\u1EE3c t\u1EA1o hay s\u1EEDa**
decision. Th\u1EA5y m\xE2u thu\u1EABn th\xEC n\xEAu ra cho ng\u01B0\u1EDDi x\u1EED l\xFD.

## Anchor l\xE0 b\u1EAFt bu\u1ED9c

Anchor l\xE0 b\u1EB1ng ch\u1EE9ng. Ch\u1EA5p nh\u1EADn:

- \`src/api/handler.ts#L42\` ho\u1EB7c \`src/api/handler.ts:42\` \u2014 v\u1ECB tr\xED trong file
- \`commit:a1b2c3d\` \u2014 commit
- d\u1EA1ng object cho URL (**ph\u1EA3i** c\xF3 \`fetched_at\`) v\xE0 cho ng\u01B0\u1EDDi
  (\`kind: human\`, \`by\`, \`at\`)

Kh\xF4ng c\xF3 anchor th\xEC kh\xF4ng ph\u1EA3i tri th\u1EE9c, ch\u1EC9 l\xE0 \xFD ki\u1EBFn \u2014 v\xE0 hook s\u1EBD ch\u1EB7n ghi.

## \u0110i\u1EC1u tuy\u1EC7t \u0111\u1ED1i kh\xF4ng l\xE0m

- \u274C Ghi k\u1EBFt lu\u1EADn suy ra t\u1EEB tr\xED nh\u1EDB ho\u1EB7c t\u1EEB ki\u1EBFn th\u1EE9c chung m\xE0 kh\xF4ng ch\u1EC9 \u0111\u01B0\u1EE3c ngu\u1ED3n
- \u274C N\xE2ng m\u1ED9t claim l\xEAn fact m\xE0 kh\xF4ng ch\u1EA1y probe
- \u274C S\u1EEDa \`last_verified_at\` b\u1EB1ng tay m\xE0 kh\xF4ng th\u1EADt s\u1EF1 ch\u1EA1y verify
- \u274C Vi\u1EBFt t\u1ED5ng k\u1EBFt v\u0103n xu\xF4i r\u1ED3i coi \u0111\xF3 l\xE0 tri th\u1EE9c d\u1EF1 \xE1n

\u0110i\u1EC1u cu\u1ED1i l\xE0 ngu\u1ED3n g\u1ED1c c\u1EE7a vi\u1EC7c m\u1ED9t hi\u1EC3u nh\u1EA7m \u1EDF phi\xEAn n\xE0y l\xE0m h\u1ECFng m\u1ECDi phi\xEAn sau.

## Khi kh\xF4ng ch\u1EAFc

N\xF3i th\u1EB3ng l\xE0 kh\xF4ng ch\u1EAFc, ghi v\xE0o \`open_questions\` c\u1EE7a task. M\u1ED9t c\xE2u h\u1ECFi m\u1EDF \u0111\u01B0\u1EE3c
ghi l\u1EA1i c\xF3 \xEDch h\u01A1n m\u1ED9t c\xE2u tr\u1EA3 l\u1EDDi t\u1EF1 tin m\xE0 sai.
`;
}
function architectureRuleMd() {
  return `# Lu\u1EADt ki\u1EBFn tr\xFAc: t\xE1ch l\xF5i kh\u1ECFi I/O (ganas)

L\xF5i nghi\u1EC7p v\u1EE5 kh\xF4ng \u0111\u01B0\u1EE3c g\u1ECDi th\u1EB3ng ra ngo\xE0i (filesystem, network, DB, h\xE0ng \u0111\u1EE3i).
Mu\u1ED1n ch\u1EA1m ngo\xE0i th\xEC \u0111i qua m\u1ED9t ranh gi\u1EDBi r\xF5 r\xE0ng \u2014 \u0111\xE2y l\xE0 hexagonal
architecture / ports & adapters, \xE1p d\u1EE5ng b\u1EA5t k\u1EC3 ng\xF4n ng\u1EEF.

## \xC1nh x\u1EA1 v\xE0o s\u01A1 \u0111\u1ED3 kh\u1ED1i c\u1EE7a ganas

\`Module.nature\` \u0111\xE3 s\u1EB5n c\xF3 b\u1ED1n gi\xE1 tr\u1ECB, v\xE0 ch\xFAng CH\xCDNH L\xC0 ranh gi\u1EDBi n\xE0y:

- \`code\` / \`data\` / \`llm\` \u2014 **l\xF5i**. Kh\xF4ng t\u1EF1 m\u1EDF file, kh\xF4ng t\u1EF1 g\u1ECDi network,
  kh\xF4ng t\u1EF1 query DB b\xEAn trong.
- \`io\` \u2014 **n\u01A1i CH\u1EA0M I/O th\u1EADt**. API, h\xE0ng \u0111\u1EE3i, filesystem \u2014 \u0111\xFAng nh\u01B0 docstring
  c\u1EE7a \`MODULE_NATURE\` \u0111\xE3 \u0111\u1ECBnh ngh\u0129a.

L\xF5i **\u0111\u1ECBnh ngh\u0129a port** (interface/Protocol) v\xE0 kh\xF4ng nh\xE9t
\`fetch\`/\`fs.readFile\`/query th\u1EB3ng v\xE0o code c\u1EE7a m\xECnh. Kh\u1ED1i \`io\` **c\xE0i \u0111\u1EB7t** port \u0111\xF3,
n\xEAn ch\xEDnh n\xF3 khai \`depends_on: [<kh\u1ED1i l\xF5i>]\` \u2014 adapter ph\u1EE5 thu\u1ED9c l\xF5i, kh\xF4ng ng\u01B0\u1EE3c
l\u1EA1i. \u0110\xF3 c\u0169ng l\xE0 chi\u1EC1u m\xE0 \`ganas scope new\` sinh ra khi n\xF3 t\u1EF1 t\xE1ch hai kh\u1ED1i.

## V\xEC sao

L\xF5i thu\u1EA7n th\xEC test kh\xF4ng c\u1EA7n mock h\u1EA1 t\u1EA7ng th\u1EADt. \u0110\u1ED5i h\u1EA1 t\u1EA7ng (\u0111\u1ED5i DB, \u0111\u1ED5i
provider, \u0111\u1ED5i API b\xEAn th\u1EE9 ba) kh\xF4ng \u0111\u1EE5ng t\u1EDBi logic nghi\u1EC7p v\u1EE5 \u2014 ch\u1EC9 thay
implementation \u1EDF ph\xEDa \`io\`.

## L\xE0m \u1EDF TypeScript

\u0110\u1ECBnh ngh\u0129a \`interface\` cho "port" (vd \`interface UserRepo { findById(id): User }\`).
L\xF5i ph\u1EE5 thu\u1ED9c v\xE0o interface \u0111\xF3, kh\xF4ng ph\u1EE5 thu\u1ED9c th\u01B0 vi\u1EC7n I/O c\u1EE5 th\u1EC3.
Implementation th\u1EADt (\u0111\u1ECDc file, g\u1ECDi API, query DB) n\u1EB1m \u1EDF m\u1ED9t module ri\xEAng, c\xE0i
\u0111\u1EB7t interface \u2014 \u0111\xF3 l\xE0 kh\u1ED1i \`nature: io\`.

## L\xE0m \u1EDF Python

T\u01B0\u01A1ng t\u1EF1 b\u1EB1ng \`Protocol\` ho\u1EB7c \`ABC\` cho "port". Dependency injection: truy\u1EC1n
instance \u0111\xE3 c\u1EA5u h\xECnh s\u1EB5n v\xE0o h\xE0m/l\u1EDBp nghi\u1EC7p v\u1EE5, kh\xF4ng \`import\` tr\u1EF1c ti\u1EBFp th\u1EE9
ch\u1EA1m I/O (client HTTP, driver DB) ngay trong h\xE0m nghi\u1EC7p v\u1EE5.

## \u0110\xE2y l\xE0 h\u01B0\u1EDBng d\u1EABn, kh\xF4ng ph\u1EA3i lu\u1EADt m\xE1y ki\u1EC3m

ganas kh\xF4ng (v\xE0 kh\xF4ng th\u1EC3 ki\u1EC3m \u0111\xE1ng tin c\u1EADy) validator n\xE0o b\u1EAFt vi ph\u1EA1m n\xE0y \u2014
kh\xE1c v\u1EDBi lu\u1EADt ghi tri th\u1EE9c (\`.claude/rules/ganas-knowledge.md\`), \u0111\xE2y kh\xF4ng c\xF3
hook n\xE0o ch\u1EB7n. \xC1p d\u1EE5ng khi vi\u1EBFt code, v\xE0 khi g\xE1n \`nature\` cho kh\u1ED1i m\u1EDBi: h\u1ECFi
"kh\u1ED1i n\xE0y c\xF3 t\u1EF1 ch\u1EA1m ra ngo\xE0i kh\xF4ng" tr\u01B0\u1EDBc khi ch\u1ECDn \`io\` hay kh\xF4ng.
`;
}
function gitRuleMd() {
  return `# Lu\u1EADt git: tag, k\xFD commit (ganas)

## Tag: semver tr\u1EA7n, kh\xF4ng gh\xE9p t\xEAn c\xF4ng c\u1EE5

Tag c\u1EE7a D\u1EF0 \xC1N N\xC0Y l\xE0 \`vX.Y.Z\` (semver) \u2014 vd \`v1.2.0\`. KH\xD4NG ph\u1EA3i
\`<t\xEAn>--vX.Y.Z\`.

\u0110\u1ECBnh d\u1EA1ng \`<t\xEAn>--vX.Y.Z\` l\xE0 quy \u01B0\u1EDBc RI\xCANG c\u1EE7a \`claude plugin tag\` \u2014 ch\u1EC9 \xE1p
d\u1EE5ng khi CH\xCDNH d\u1EF1 \xE1n n\xE0y l\xE0 m\u1ED9t Claude Code plugin, d\xF9ng \u0111\u1EC3 marketplace ph\xE2n
gi\u1EA3i version (ganas d\xF9ng \u0111\xFAng c\xE1ch n\xE0y cho ch\xEDnh repo ganas). D\u1EF1 \xE1n d\xF9ng
ganas kh\xF4ng c\xF3 ngh\u0129a l\xE0 ph\u1EA3i tag theo ki\u1EC3u \u0111\xF3.

\`\`\`
git tag -a v1.2.0 -m "..."
git push origin v1.2.0
\`\`\`

## K\xFD commit: c\u1EA5u h\xECnh theo T\u1EEANG repo, kh\xF4ng \`--global\`

C\xF3 ganas \u21D2 c\u1EA5u h\xECnh k\xFD commit c\u1EE5c b\u1ED9 cho repo n\xE0y. Kh\xF4ng s\u1EEDa \`--global\` \u2014
m\u1ED7i repo c\xF3 th\u1EC3 c\u1EA7n key/ch\xEDnh s\xE1ch kh\xE1c nhau, s\u1EEDa global l\xE0 \xE9p m\u1ECDi repo kh\xE1c
tr\xEAn m\xE1y d\xF9ng chung m\u1ED9t quy\u1EBFt \u0111\u1ECBnh kh\xF4ng li\xEAn quan t\u1EDBi ch\xFAng.

\`\`\`
git config gpg.format ssh
git config user.signingkey <\u0111\u01B0\u1EDDng d\u1EABn public key SSH \u0111ang d\xF9ng \u0111\u1EC3 push>
git config commit.gpgsign true
\`\`\`

Sau \u0111\xF3 \u0111\u0103ng k\xFD \u0110\xDANG public key \u0111\xF3 tr\xEAn git host \u2014 GitHub: Settings \u2192 SSH and
GPG keys \u2192 New SSH key \u2192 **Key type: Signing Key** (m\u1EE5c ri\xEAng, kh\xE1c
Authentication Key d\xF9 c\xF9ng m\u1ED9t key). Thi\u1EBFu b\u01B0\u1EDBc n\xE0y th\xEC commit v\u1EABn \u0111\u01B0\u1EE3c k\xFD
nh\u01B0ng host v\u1EABn b\xE1o "Unverified".

## Kh\xF4ng c\xF3 "Co-Authored-By" / nh\u1EAFc AI trong commit

\`ganas commit\` kh\xF4ng t\u1EF1 th\xEAm d\xF2ng n\xE0y. Khi commit tr\u1EF1c ti\u1EBFp b\u1EB1ng
\`git commit\` (kh\xF4ng qua \`ganas commit\`), c\xF3 hai l\u1EDBp:

- \`attribution.commit: ""\` trong \`.claude/settings.json\` \u2014 ch\u1EB7n Claude Code
  T\u1EF0 \u0110\u1ED8NG ch\xE8n d\xF2ng n\xE0y.
- Hook \`.githooks/commit-msg\` (\`ganas init\` t\u1EF1 b\u1EADt b\u1EB1ng
  \`git config core.hooksPath .githooks\`) \u2014 b\u1EAFt v\xE0 **t\u1EF1 xo\xE1** d\xF2ng
  \`Co-Authored-By\` nh\u1EAFc Claude/Anthropic kh\u1ECFi M\u1ECCI commit, k\u1EC3 c\u1EA3 khi ai \u0111\xF3
  (ng\u01B0\u1EDDi ho\u1EB7c agent) g\xF5 tay d\xF2ng \u0111\xF3 v\xE0o message. \u0110\xE2y l\xE0 l\u1EDBp c\u01B0\u1EE1ng ch\u1EBF th\u1EADt:
  \`attribution.commit\` ch\u1EC9 ch\u1EB7n \u0111\u01B0\u1EE3c \u0111\u01B0\u1EDDng t\u1EF1 \u0111\u1ED9ng, kh\xF4ng ch\u1EB7n \u0111\u01B0\u1EE3c ng\u01B0\u1EDDi
  t\u1EF1 g\xF5 \u2014 hook ch\u1EB7n \u0111\u01B0\u1EE3c c\u1EA3 hai v\xEC n\xF3 ch\u1EA1y sau c\xF9ng, tr\xEAn ch\xEDnh n\u1ED9i dung
  message, b\u1EA5t k\u1EC3 ngu\u1ED3n.
`;
}
function commitMsgHook() {
  return `#!/bin/sh
# ganas: c\u01B0\u1EE1ng ch\u1EBF quy \u01B0\u1EDBc "kh\xF4ng Co-Authored-By nh\u1EAFc AI" b\u1EB1ng m\xE1y, kh\xF4ng
# ch\u1EC9 d\u1EF1a v\xE0o agent nh\u1EDB \u0111\xFAng lu\u1EADt m\u1ED7i l\u1EA7n commit \u2014 xem
# .claude/rules/ganas-git.md. T\u1EF1 \u0111\u1ED9ng b\u1ECF d\xF2ng vi ph\u1EA1m r\u1ED3i cho commit ti\u1EBFp
# t\u1EE5c (kh\xF4ng ch\u1EB7n), v\xEC m\u1EE5c ti\xEAu l\xE0 commit s\u1EA1ch, kh\xF4ng ph\u1EA3i l\xE0m kh\xF3 ng\u01B0\u1EDDi
# \u0111ang commit.

MSG_FILE="$1"

if grep -qiE '^Co-Authored-By:.*(claude|anthropic)' "$MSG_FILE" 2>/dev/null; then
  perl -0pi -e 's/^Co-Authored-By:.*(claude|anthropic).*\\n?//gim; s/\\n+\\z/\\n/' "$MSG_FILE"
  echo "ganas commit-msg hook: \u0111\xE3 b\u1ECF d\xF2ng Co-Authored-By nh\u1EAFc AI (xem .claude/rules/ganas-git.md)" >&2
fi

exit 0
`;
}
function preCommitHook() {
  return `#!/bin/sh
# ganas: s\u1ED5 c\xE1i .ganas/verify-ledger.jsonl l\xE0 append-only v\xE0 c\xF3 hash-chain.
# \u0110\u1EE9t chain ngh\u0129a l\xE0 c\xF3 d\xF2ng b\u1ECB s\u1EEDa, xo\xE1 ho\u1EB7c \u0111\u1EA3o th\u1EE9 t\u1EF1 SAU khi ghi \u2014 t\u1EE9c
# b\u1EB1ng ch\u1EE9ng "probe \u0111\xE3 th\u1EADt s\u1EF1 ch\u1EA1y" kh\xF4ng c\xF2n \u0111\xE1ng tin.

if command -v ganas >/dev/null 2>&1; then
  ganas ledger --check || exit 1
elif command -v bunx >/dev/null 2>&1 && [ -d node_modules/ganas ]; then
  bunx ganas ledger --check || exit 1
elif command -v npx >/dev/null 2>&1 && [ -d node_modules/ganas ]; then
  npx --no-install ganas ledger --check || exit 1
fi
# Kh\xF4ng t\xECm th\u1EA5y ganas: nh\u01B0\u1EDDng \u0111\u01B0\u1EDDng. Hook kh\xF4ng ph\u1EA3i h\xE0ng r\xE0o an ninh \u2014
# \`ganas validate\` v\xE0 CI m\u1EDBi l\xE0 ch\u1ED7 chuy\u1EC7n n\xE0y \u0111\u01B0\u1EE3c ch\u1EB7n th\u1EADt.

exit 0
`;
}
function agentsMd(v) {
  return `# ${v.project}

H\u01B0\u1EDBng d\u1EABn chung cho c\xE1c coding agent (Claude Code, Codex, Cursor\u2026).

D\u1EF1 \xE1n d\xF9ng **ganas**: tr\u1EA1ng th\xE1i c\xF4ng vi\u1EC7c v\xE0 tri th\u1EE9c \u0111\xE3 ki\u1EC3m ch\u1EE9ng n\u1EB1m \u1EDF
\`.ganas/\`. Tr\u01B0\u1EDBc khi s\u1EEDa g\xEC, ch\u1EA1y \`ganas next\` \u0111\u1EC3 l\u1EA5y task hi\u1EC7n t\u1EA1i v\xE0 brief.

Lu\u1EADt ghi tri th\u1EE9c: xem \`.claude/rules/ganas-knowledge.md\`. T\xF3m t\u1EAFt: m\u1ECDi ph\xE1t
bi\u1EC3u ghi v\xE0o \`.ganas/\` ph\u1EA3i k\xE8m b\u1EB1ng ch\u1EE9ng (anchor \`file:line\`, commit, ho\u1EB7c
URL k\xE8m th\u1EDDi \u0111i\u1EC3m l\u1EA5y). Kh\xF4ng c\xF3 b\u1EB1ng ch\u1EE9ng th\xEC kh\xF4ng ghi.

Tr\u01B0\u1EDBc khi commit: \`ganas validate\`.
`;
}
function gitignoreAddition() {
  const lines = LOCAL_ONLY.map((p) => `.ganas/${p}`).join("\n");
  return `
# ganas \u2014 tr\u1EA1ng th\xE1i phi\xEAn, kh\xF4ng chia s\u1EBB gi\u1EEFa c\xE1c m\xE1y
${lines}
`;
}
function sampleGoal(id, v) {
  const approved = v.owner ? `status: active
approved_by: "${v.owner}"
approved_at: ${(/* @__PURE__ */ new Date()).toISOString()}
` : `# Ch\u01B0a c\xF3 ng\u01B0\u1EDDi duy\u1EC7t \u21D2 gi\u1EEF \u1EDF draft. \u0110i\u1EC1n approved_by + approved_at r\u1ED3i
# chuy\u1EC3n sang active. Model kh\xF4ng \u0111\u01B0\u1EE3c t\u1EF1 ch\u1ED1t m\u1EE5c ti\xEAu.
status: draft
`;
  return `id: ${id}
title: "\u0110\u1EB7t t\xEAn m\u1EE5c ti\xEAu \u1EDF \u0111\xE2y"
outcome: "K\u1EBFt qu\u1EA3 ng\u01B0\u1EDDi d\xF9ng c\u1EA3m nh\u1EADn \u0111\u01B0\u1EE3c \u2014 kh\xF4ng ph\u1EA3i vi\u1EC7c ph\u1EA3i l\xE0m"

# Ti\xEAu ch\xED nghi\u1EC7m thu. B\u1EAFt bu\u1ED9c c\xF3 \xEDt nh\u1EA5t m\u1ED9t, v\xE0 ph\u1EA3i tr\u1EA3 l\u1EDDi \u0111\u01B0\u1EE3c c\xF3/kh\xF4ng.
acceptance:
  - id: A-1
    kind: command
    run: "echo 'thay b\u1EB1ng l\u1EC7nh ki\u1EC3m tra th\u1EADt'"
    expect: exit_zero
  # - id: A-2
  #   kind: manual
  #   check: "K\u1EBF to\xE1n tr\u01B0\u1EDFng x\xE1c nh\u1EADn s\u1ED1 li\u1EC7u kh\u1EDBp s\u1ED5"
  #   owner: "@ke-toan-truong"

${approved}`;
}
function readme() {
  return `# .ganas/

Kho tr\u1EA1ng th\xE1i v\xE0 tri th\u1EE9c c\u1EE7a d\u1EF1 \xE1n, do \`ganas\` qu\u1EA3n l\xFD.

| Th\u01B0 m\u1EE5c | Ch\u1EE9a g\xEC |
|---|---|
| \`goals/\` | M\u1EE5c ti\xEAu \u2014 m\u1ED7i file m\u1ED9t goal. Ph\u1EA3i c\xF3 ng\u01B0\u1EDDi duy\u1EC7t. |
| \`designs/\` | C\xE1ch ti\u1EBFp c\u1EADn. B\u1EAFt bu\u1ED9c khai \`serves\` \u2014 design kh\xF4ng neo v\xE0o goal l\xE0 kh\xF4ng h\u1EE3p l\u1EC7. |
| \`tasks/\` | \u0110\u01A1n v\u1ECB vi\u1EC7c v\u1EEBa m\u1ED9t phi\xEAn. C\xF3 context_contract v\xE0 exit_contract. |
| \`scopes/\` | Ph\u1EA1m vi c\xF4ng vi\u1EC7c \u2014 ranh gi\u1EDBi code + ng\u01B0\u1EDDi k\xFD + nghi\u1EC7m thu. Fact/claim ch\u1EC9 \u0111\xFAng TRONG m\u1ED9t ph\u1EA1m vi. |
| \`modules/\` | Kh\u1ED1i c\u1EE7a s\u01A1 \u0111\u1ED3: contract v\xE0o/ra, \`depends_on\` = c\u1EA1nh, \`verify\` = b\u1EB1ng ch\u1EE9ng |
| \`facts/\` | \u0110i\u1EC1u ki\u1EC3m ch\u1EE9ng \u0111\u01B0\u1EE3c, c\xF3 probe ch\u1EA1y l\u1EA1i \u0111\u01B0\u1EE3c |
| \`claims/\` | \u0110i\u1EC1u \u0111\u01B0\u1EE3c tin nh\u01B0ng ch\u01B0a ki\u1EC3m ch\u1EE9ng, c\xF3 anchor |
| \`decisions/\` | \u0110i\u1EC1u ng\u01B0\u1EDDi \u0111\xE3 ch\u1ED1t |
| \`icebox/\` | Vi\u1EC7c \u0111\xE3 quy\u1EBFt CH\u01AFA l\xE0m \u2014 ph\xE1t hi\u1EC7n gi\u1EEFa phi\xEAn, ch\u1EA5m \u0111i\u1EC3m, ch\u01B0a t\u1EDBi l\u01B0\u1EE3t l\xE0m |
| \`legacy/\` | Tri th\u1EE9c import t\u1EEB t\xE0i li\u1EC7u c\u0169 \u2014 b\u1ECB c\xE1ch ly cho t\u1EDBi khi \u0111\u1ED1i ch\u1EA5t |
| \`map/\` | B\u1EA3n \u0111\u1ED3 v\xF9ng code v\xE0 survey |
| \`proposals/\` | \u0110\u1EC1 xu\u1EA5t ch\u1EDD ng\u01B0\u1EDDi duy\u1EC7t (spine, pack) |
| \`runs/\` | Handoff record theo phi\xEAn (kh\xF4ng commit) |

S\u1EEDa tay \u0111\u01B0\u1EE3c \u2014 \u0111\u1EC1u l\xE0 YAML. Sau khi s\u1EEDa ch\u1EA1y \`ganas validate\`.
`;
}
var init_project = __esm({
  "src/templates/project.ts"() {
    "use strict";
    init_paths();
  }
});

// src/commands/init.ts
var init_exports = {};
__export(init_exports, {
  run: () => run2
});
import { existsSync as existsSync7 } from "node:fs";
import { appendFile as appendFile2, chmod, mkdir as mkdir3, readFile as readFile8, writeFile as writeFile3 } from "node:fs/promises";
import { basename, join as join8, resolve as resolve2 } from "node:path";
async function prompt(question, fallback = "") {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = fallback ? ` [${fallback}]` : "";
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}
async function writeNew(file, content, force) {
  if (existsSync7(file) && !force) return "kept";
  await mkdir3(join8(file, ".."), { recursive: true });
  await writeFile3(file, content, "utf8");
  return "written";
}
async function run2(argv) {
  const cwd = resolve2(option(argv, "root") ?? process.cwd());
  const force = flag(argv, "force");
  const noninteractive = flag(argv, "yes", "y") || !process.stdin.isTTY;
  const existing = findGanasRoot(cwd);
  if (existing && !force) {
    throw new GanasError(
      `d\u1EF1 \xE1n \u0111\xE3 c\xF3 .ganas/ t\u1EA1i ${existing}.
  Mu\u1ED1n th\xEAm m\u1EE5c ti\xEAu/task m\u1EDBi: s\u1EEDa file trong .ganas/ r\u1ED3i ch\u1EA1y ganas validate
  Mu\u1ED1n kh\u1EDFi t\u1EA1o l\u1EA1i t\u1EEB \u0111\u1EA7u:   ganas init --force`
    );
  }
  const project = option(argv, "project") ?? (noninteractive ? basename(cwd) : await prompt("T\xEAn d\u1EF1 \xE1n", basename(cwd)));
  const ownerRaw = option(argv, "owner") ?? (noninteractive ? "" : await prompt("Handle ng\u01B0\u1EDDi duy\u1EC7t m\u1EE5c ti\xEAu (vd @nguyen-a), b\u1ECF tr\u1ED1ng n\u1EBFu ch\u01B0a c\xF3"));
  const owner = ownerRaw ? ownerRaw.startsWith("@") ? ownerRaw : `@${ownerRaw}` : void 0;
  const vars = { project, owner };
  const written = [];
  const kept = [];
  const track = (rel, result) => {
    (result === "written" ? written : kept).push(rel);
  };
  for (const dir of SUBDIRS) await mkdir3(ganasPath(cwd, dir), { recursive: true });
  track(
    `${GANAS_DIR}/${CONFIG_FILE}`,
    await writeNew(ganasPath(cwd, CONFIG_FILE), configYaml(vars), force)
  );
  track(`${GANAS_DIR}/README.md`, await writeNew(ganasPath(cwd, "README.md"), readme(), force));
  track(
    `${GANAS_DIR}/${STATE_FILE}`,
    await writeNew(
      ganasPath(cwd, STATE_FILE),
      JSON.stringify({ version: 1, current_task: null }, null, 2) + "\n",
      force
    )
  );
  track(
    ".claude/rules/ganas-knowledge.md",
    await writeNew(join8(cwd, ".claude", "rules", "ganas-knowledge.md"), knowledgeRuleMd(), force)
  );
  track(
    ".claude/rules/architecture.md",
    await writeNew(join8(cwd, ".claude", "rules", "architecture.md"), architectureRuleMd(), force)
  );
  track(
    ".claude/rules/ganas-git.md",
    await writeNew(join8(cwd, ".claude", "rules", "ganas-git.md"), gitRuleMd(), force)
  );
  const claudeMdPath = join8(cwd, "CLAUDE.md");
  const claudeMdResult = await writeNew(claudeMdPath, claudeMd(vars), force);
  track("CLAUDE.md", claudeMdResult);
  track("AGENTS.md", await writeNew(join8(cwd, "AGENTS.md"), agentsMd(vars), force));
  const goalId = "G-001";
  track(
    `${GANAS_DIR}/${DIRS.goals}/${goalId}.yaml`,
    await writeNew(ganasPath(cwd, DIRS.goals, `${goalId}.yaml`), sampleGoal(goalId, vars), force)
  );
  await ensureGitignore(cwd);
  const hook = await ensureCommitMsgHook(cwd, force);
  if (hook) track(hook.path, hook.result);
  const preCommit = await ensureGitHook(cwd, "pre-commit", preCommitHook(), force);
  if (preCommit) track(preCommit.path, preCommit.result);
  process.stdout.write(`ganas \u0111\xE3 kh\u1EDFi t\u1EA1o t\u1EA1i ${cwd}

`);
  if (written.length) process.stdout.write(`  t\u1EA1o m\u1EDBi:  ${written.join("\n            ")}
`);
  if (kept.length) process.stdout.write(`  gi\u1EEF nguy\xEAn: ${kept.join("\n              ")}
`);
  if (claudeMdResult === "kept") {
    process.stdout.write(
      `
  \u26A0 CLAUDE.md \u0111\xE3 c\xF3 s\u1EB5n n\xEAn kh\xF4ng b\u1ECB \u0111\xE8.
    N\u1ED9i dung \u1EDF \u0111\xF3 CH\u01AFA \u0111\u01B0\u1EE3c \u0111\u1ED1i ch\u1EA5t v\u1EDBi code th\u1EADt. Mu\u1ED1n \u0111\u01B0a v\xE0o kho tri
    th\u1EE9c th\xEC ghi th\xE0nh claim \u1EDF .ganas/legacy/imported/ (ti\u1EC1n t\u1ED1 LC-,
    provenance: imported) r\u1ED3i verify d\u1EA7n \u2014 \u0111\u1EEBng coi n\xF3 l\xE0 s\u1EF1 th\u1EADt s\u1EB5n c\xF3.
`
    );
  }
  process.stdout.write(
    `
Ti\u1EBFp theo:
  1. S\u1EEDa .ganas/goals/${goalId}.yaml \u2014 m\u1EE5c ti\xEAu th\u1EADt v\xE0 ti\xEAu ch\xED nghi\u1EC7m thu th\u1EADt
` + (owner ? "" : `  2. \u0110i\u1EC1n approved_by + approved_at r\u1ED3i chuy\u1EC3n status: active
`) + `  ${owner ? "2" : "3"}. ganas validate
`
  );
  return 0;
}
async function ensureGitignore(cwd) {
  const file = join8(cwd, ".gitignore");
  if (!existsSync7(file)) {
    if (!existsSync7(join8(cwd, ".git"))) return;
    await writeFile3(file, gitignoreAddition().trimStart(), "utf8");
    return;
  }
  const current = await readFile8(file, "utf8");
  if (current.includes(".ganas/runs/")) return;
  await appendFile2(file, gitignoreAddition(), "utf8");
}
async function ensureGitHook(cwd, name, content, force) {
  if (!existsSync7(join8(cwd, ".git"))) return void 0;
  const hookFile = join8(cwd, ".githooks", name);
  const result = await writeNew(hookFile, content, force);
  await chmod(hookFile, 493);
  const current = await runShell("git config --get core.hooksPath", { cwd, timeoutMs: 5e3 });
  const already = current.code === 0 ? current.stdout.trim() : "";
  if (already === "" || already === ".githooks") {
    await runShell("git config core.hooksPath .githooks", { cwd, timeoutMs: 5e3 });
  }
  return { path: `.githooks/${name}`, result };
}
async function ensureCommitMsgHook(cwd, force) {
  return ensureGitHook(cwd, "commit-msg", commitMsgHook(), force);
}
var SUBDIRS;
var init_init = __esm({
  "src/commands/init.ts"() {
    "use strict";
    init_paths();
    init_project();
    init_args();
    init_errors();
    init_exec();
    SUBDIRS = [
      DIRS.goals,
      DIRS.designs,
      DIRS.tasks,
      DIRS.scopes,
      DIRS.modules,
      DIRS.facts,
      DIRS.claims,
      DIRS.decisions,
      DIRS.icebox,
      DIRS.domains,
      DIRS.legacyImported,
      DIRS.mapSurveys,
      DIRS.proposals,
      DIRS.runs
    ];
  }
});

// src/graph/types.ts
function countBySeverity(diags) {
  const out = { error: 0, warning: 0, info: 0 };
  for (const d of diags) out[d.severity]++;
  return out;
}
var init_types2 = __esm({
  "src/graph/types.ts"() {
    "use strict";
  }
});

// src/commands/validate.ts
var validate_exports = {};
__export(validate_exports, {
  run: () => run3
});
function useColor() {
  return process.stdout.isTTY === true && !process.env["NO_COLOR"];
}
function paint(text, color) {
  return useColor() ? `${COLORS[color]}${text}${COLORS.reset}` : text;
}
function formatDiagnostic(d) {
  const where = d.line === void 0 ? d.file : `${d.file}:${d.line}`;
  const head = `${where}  ${paint(LABEL[d.severity], d.severity)}  ${paint(d.code, "dim")}`;
  const lines = [head, `  ${d.message}`];
  if (d.hint) lines.push(paint(`  \u2192 ${d.hint}`, "dim"));
  return lines.join("\n");
}
function sortDiagnostics(diags) {
  const rank = { error: 0, warning: 1, info: 2 };
  return [...diags].sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0)
  );
}
async function run3(argv) {
  const root = requireGanasRoot(option(argv, "root") ?? process.cwd());
  const graph = await loadGraph(root);
  const diags = sortDiagnostics(validateGraph(graph));
  const counts = countBySeverity(diags);
  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ root, counts, diagnostics: diags }, null, 2) + "\n");
    return counts.error > 0 || flag(argv, "strict") && counts.warning > 0 ? 1 : 0;
  }
  const quiet = flag(argv, "quiet", "q");
  const visible = quiet ? diags.filter((d) => d.severity === "error") : diags;
  for (const d of visible) process.stdout.write(formatDiagnostic(d) + "\n\n");
  const parts = [];
  if (counts.error) parts.push(`${counts.error} l\u1ED7i`);
  if (counts.warning) parts.push(`${counts.warning} c\u1EA3nh b\xE1o`);
  if (counts.info) parts.push(`${counts.info} ghi ch\xFA`);
  const size = `${graph.goals.size} goal \xB7 ${graph.designs.size} design \xB7 ${graph.tasks.size} task \xB7 ${graph.scopes.size} ph\u1EA1m vi \xB7 ${graph.modules.size} kh\u1ED1i \xB7 ${graph.facts.size} fact \xB7 ${graph.claims.size} claim`;
  if (parts.length === 0) {
    process.stdout.write(`${paint("\u2713", "info")} graph h\u1EE3p l\u1EC7 \u2014 ${size}
`);
    return 0;
  }
  process.stdout.write(`${parts.join(", ")} \u2014 ${size}
`);
  if (counts.error > 0) return 1;
  if (flag(argv, "strict") && counts.warning > 0) return 1;
  return 0;
}
var COLORS, LABEL;
var init_validate2 = __esm({
  "src/commands/validate.ts"() {
    "use strict";
    init_load();
    init_paths();
    init_types2();
    init_validate();
    init_args();
    COLORS = {
      error: "\x1B[31m",
      warning: "\x1B[33m",
      info: "\x1B[36m",
      dim: "\x1B[2m",
      reset: "\x1B[0m"
    };
    LABEL = { error: "l\u1ED7i", warning: "c\u1EA3nh b\xE1o", info: "ghi ch\xFA" };
  }
});

// src/graph/trace.ts
function contractEdges(graph) {
  const out = [];
  for (const [id, sourced] of graph.modules) {
    for (const v of sourced.value.verify) {
      if (v.kind === "contract") {
        out.push({
          from: id,
          to: v.to,
          verificationId: v.id,
          verification: v,
          statement: sourced.value.title
        });
      }
    }
  }
  return out;
}
function portIssues(from, to) {
  const outputs = new Map(from.contract.outputs.map((p) => [p.name, p]));
  const issues = [];
  for (const input of to.contract.inputs) {
    if (input.optional) continue;
    const out = outputs.get(input.name);
    if (!out) {
      issues.push({
        port: input.name,
        reason: `${from.id} kh\xF4ng c\xF3 c\u1ED5ng ra t\xEAn "${input.name}" m\xE0 ${to.id} c\u1EA7n`
      });
      continue;
    }
    if (out.shape.trim() !== input.shape.trim()) {
      issues.push({
        port: input.name,
        reason: `c\u1ED5ng "${input.name}" l\u1EC7ch ki\u1EC3u \u2014 ${from.id} xu\u1EA5t \`${out.shape}\`, ${to.id} c\u1EA7n \`${input.shape}\``
      });
    }
  }
  return issues;
}
async function checkEdge(graph, edge, root) {
  const from = graph.modules.get(edge.from)?.value;
  const to = graph.modules.get(edge.to)?.value;
  if (!from || !to) {
    const missing = !from ? edge.from : edge.to;
    return {
      edge,
      result: "unprovable",
      issues: [],
      reason: `kh\u1ED1i ${missing} kh\xF4ng t\u1ED3n t\u1EA1i`
    };
  }
  const issues = portIssues(from, to);
  if (issues.length > 0) {
    return { edge, result: "fail", issues, reason: issues.map((i) => i.reason).join("; ") };
  }
  const run20 = edge.verification.run;
  if (!run20) return { edge, result: "pass", issues: [] };
  const findings = lintProbe({
    run: run20,
    statement: `${from.id} \u2192 ${to.id}`,
    context: [
      ...from.contract.outputs.map((p) => p.name),
      ...to.contract.inputs.map((p) => p.name)
    ]
  });
  if (hasBlockingFinding(findings)) {
    const blocking = findings.filter((f) => f.severity === "error");
    return {
      edge,
      result: "unprovable",
      issues: [],
      reason: blocking.map((f) => f.message).join("; ")
    };
  }
  const result = await runShell(run20, { cwd: root, timeoutMs: 6e4 });
  const verdict = judge(result, "exit_zero");
  if (!verdict.pass) {
    return { edge, result: "fail", issues: [], reason: verdict.reason };
  }
  return { edge, result: "pass", issues: [] };
}
async function checkAllEdges(graph, root) {
  const edges = contractEdges(graph);
  return Promise.all(edges.map((edge) => checkEdge(graph, edge, root)));
}
async function recordEdgeChecks(graph, checks, opts) {
  const ctx = await runContext(opts.root, opts.by);
  for (const check of checks) {
    if (check.result === "unprovable") continue;
    await appendEntry(opts.root, {
      target: `${check.edge.from}/${check.edge.verificationId}`,
      kind: "contract",
      at: (/* @__PURE__ */ new Date()).toISOString(),
      def: defHash(check.edge.verification, check.edge.statement),
      result: check.result,
      output: check.reason ? sha256(check.reason) : void 0,
      ...ctx
    });
  }
}
function nodeId(id) {
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}
function renderDiagram(graph, opts = {}) {
  const lines = ["flowchart LR"];
  const inScope = /* @__PURE__ */ new Set();
  for (const [scopeId, sourced] of graph.scopes) {
    const sc = sourced.value;
    lines.push(`  subgraph ${nodeId(scopeId)}["${scopeId} (${sc.version})"]`);
    for (const moduleId of sc.modules) {
      const mod = graph.modules.get(moduleId)?.value;
      inScope.add(moduleId);
      lines.push(`    ${nodeId(moduleId)}["${moduleLabel(moduleId, mod)}"]`);
    }
    lines.push("  end");
  }
  const loose = [...graph.modules.keys()].filter((id) => !inScope.has(id));
  if (loose.length > 0) {
    lines.push(`  subgraph unmapped["(ch\u01B0a g\xE1n ph\u1EA1m vi)"]`);
    for (const moduleId of loose) {
      lines.push(
        `    ${nodeId(moduleId)}["${moduleLabel(moduleId, graph.modules.get(moduleId)?.value)}"]`
      );
    }
    lines.push("  end");
  }
  for (const [id, sourced] of graph.modules) {
    for (const dep of sourced.value.depends_on) {
      lines.push(`  ${nodeId(dep)} --> ${nodeId(id)}`);
    }
  }
  for (const edge of contractEdges(graph)) {
    const key = `${edge.from}/${edge.verificationId}`;
    const result = opts.edgeResults?.get(key);
    const mark = result === "pass" ? "\u2713" : result === "fail" ? "\u2717" : result === void 0 ? "?" : result;
    lines.push(`  ${nodeId(edge.from)} -.->|h\u1EE3p \u0111\u1ED3ng ${mark}| ${nodeId(edge.to)}`);
  }
  return lines.join("\n");
}
function moduleLabel(id, mod) {
  if (!mod) return `${id}<br/>? kh\u1ED1i m\u1ED3 c\xF4i`;
  return `${id}<br/>${mod.nature} \xB7 ${mod.status}`;
}
function computeDebt(graph, checks) {
  const items = [];
  const checkedPairs = new Set(contractEdges(graph).map((e) => `${e.from}->${e.to}`));
  for (const [id, sourced] of graph.modules) {
    for (const dep of sourced.value.depends_on) {
      if (!checkedPairs.has(`${dep}->${id}`)) {
        items.push({
          kind: "uncovered-edge",
          edge: { from: dep, to: id },
          message: `c\u1EA1nh ${dep} \u2192 ${id} c\xF3 trong depends_on nh\u01B0ng kh\xF4ng c\xF3 b\u1EB1ng ch\u1EE9ng \`kind: contract\` n\xE0o ki\u1EC3m n\xF3`
        });
      }
    }
  }
  for (const check of checks) {
    if (check.result === "fail") {
      items.push({
        kind: "broken-contract",
        moduleId: check.edge.from,
        edge: { from: check.edge.from, to: check.edge.to },
        message: `h\u1EE3p \u0111\u1ED3ng ${check.edge.from}/${check.edge.verificationId} \u2192 ${check.edge.to} TR\u01AF\u1EE2T: ${check.reason ?? ""}`
      });
    }
  }
  for (const [id, sourced] of graph.modules) {
    const m = sourced.value;
    if (m.verify.length === 0 && m.status !== "unmapped") {
      items.push({
        kind: "unverified-module",
        moduleId: id,
        message: `kh\u1ED1i ${id} ch\u01B0a c\xF3 b\u1EB1ng ch\u1EE9ng n\xE0o`
      });
    }
  }
  return items;
}
var init_trace = __esm({
  "src/graph/trace.ts"() {
    "use strict";
    init_exec();
    init_ledger();
    init_lint();
  }
});

// src/commands/_common.ts
async function openProject(argv) {
  const root = requireGanasRoot(option(argv, "root") ?? process.cwd());
  const graph = await loadGraph(root);
  const freshness = await computeFreshness(graph);
  return { root, graph, freshness };
}
async function volatileStatus(root) {
  const [branch, status] = await Promise.all([
    runShell("git rev-parse --abbrev-ref HEAD", { cwd: root, timeoutMs: 5e3 }),
    runShell("git status --porcelain", { cwd: root, timeoutMs: 5e3 })
  ]);
  const lines = ["*Tr\u1EA1ng th\xE1i l\xFAc m\u1EDF phi\xEAn (ph\u1EA7n n\xE0y \u0111\u1ED5i m\u1ED7i l\u1EA7n ch\u1EA1y):*", ""];
  if (branch.code === 0) {
    const dirty = status.stdout.split("\n").filter((l) => l.trim()).length;
    lines.push(
      `- nh\xE1nh \`${branch.stdout.trim()}\`` + (dirty > 0 ? ` \xB7 ${dirty} file \u0111ang s\u1EEDa d\u1EDF` : " \xB7 c\xE2y l\xE0m vi\u1EC7c s\u1EA1ch")
    );
  }
  lines.push(`- th\u1EDDi \u0111i\u1EC3m: ${(/* @__PURE__ */ new Date()).toISOString()}`);
  return lines.join("\n");
}
var init_common2 = __esm({
  "src/commands/_common.ts"() {
    "use strict";
    init_freshness();
    init_load();
    init_paths();
    init_args();
    init_exec();
  }
});

// src/commands/scope.ts
var scope_exports = {};
__export(scope_exports, {
  looksLikeIoGlob: () => looksLikeIoGlob,
  run: () => run4,
  slugify: () => slugify
});
import { existsSync as existsSync8 } from "node:fs";
import { mkdir as mkdir4, readdir as readdir3, readFile as readFile9, writeFile as writeFile4 } from "node:fs/promises";
import { dirname as dirname4, join as join9, relative as relative3 } from "node:path";
async function writeNewYaml(file, content, describe) {
  try {
    await writeFile4(file, content, { encoding: "utf8", flag: "wx" });
  } catch (err) {
    if (err.code === "EEXIST") {
      throw new GanasError(
        `${describe} \u0111\xE3 t\u1ED3n t\u1EA1i (${relative3(process.cwd(), file)}) \u2014 m\u1ED9t phi\xEAn kh\xE1c v\u1EEBa t\u1EA1o c\xF9ng ID, ch\u1ECDn ID kh\xE1c.`
      );
    }
    throw err;
  }
}
function rowsOf(graph, freshness) {
  const debtByScope = /* @__PURE__ */ new Map();
  for (const item of computeDebt(graph, [])) {
    const sc = item.moduleId ? graph.modules.get(item.moduleId)?.value.scope : void 0;
    if (sc) debtByScope.set(sc, (debtByScope.get(sc) ?? 0) + 1);
  }
  const rows = [];
  for (const [id, sourced] of graph.scopes) {
    const sc = sourced.value;
    const tasks = [...graph.tasks.values()].filter((t) => t.value.scope === id);
    rows.push({
      id,
      title: sc.title,
      status: sc.status,
      owner: sc.owner,
      modules: sc.modules.length,
      tasks: tasks.length,
      openTasks: tasks.filter((t) => t.value.status !== "done").length,
      facts: [...graph.facts.values()].filter((f) => f.value.scope === id).length,
      claims: [...graph.claims.values()].filter((c) => c.value.scope === id).length,
      acceptance: sc.acceptance.map((a) => ({
        id: a.id,
        freshness: freshness.get(`${id}/${a.id}`)?.freshness ?? "never_verified"
      })),
      debt: debtByScope.get(id) ?? 0
    });
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}
function formatRows(rows) {
  if (rows.length === 0) {
    return `Ch\u01B0a c\xF3 ph\u1EA1m vi c\xF4ng vi\u1EC7c n\xE0o.

Ph\u1EA1m vi l\xE0 ranh gi\u1EDBi c\u1EE7a c\u1EA3 vi\u1EC7c l\u1EABn tri th\u1EE9c \u2014 task, fact, claim \u0111\u1EC1u ph\u1EA3i
thu\u1ED9c v\u1EC1 m\u1ED9t c\xE1i. T\u1EA1o c\xE1i \u0111\u1EA7u ti\xEAn:

  ganas scope new
`;
  }
  const lines = [];
  for (const r of rows) {
    const notReady = r.acceptance.filter((a) => a.freshness !== "fresh");
    lines.push(
      `${r.id} \u2014 ${r.title}
  ${r.status}` + (r.owner ? ` \xB7 nghi\u1EC7m thu ${r.owner}` : ` \xB7 \u26A0 ch\u01B0a ai k\xFD`) + ` \xB7 ${r.modules} kh\u1ED1i \xB7 ${r.openTasks}/${r.tasks} task ch\u01B0a xong \xB7 ${r.facts} fact \xB7 ${r.claims} claim`
    );
    if (r.acceptance.length === 0) {
      lines.push(`  \u26A0 ch\u01B0a c\xF3 ti\xEAu ch\xED nghi\u1EC7m thu \u2014 "b\xE0n giao xong" s\u1EBD l\xE0 \xFD ki\u1EBFn`);
    } else if (notReady.length === 0) {
      lines.push(`  \u2713 nghi\u1EC7m thu: ${r.acceptance.length}/${r.acceptance.length} c\xF2n t\u01B0\u01A1i`);
    } else {
      lines.push(
        `  \u26A0 nghi\u1EC7m thu: ${notReady.map((a) => `${a.id} (${a.freshness})`).join(", ")} \u2014 ch\u1EA1y \`ganas verify --scope ${r.id}\``
      );
    }
    if (r.debt > 0)
      lines.push(`  \u26A0 ${r.debt} m\u1EE5c n\u1EE3 ki\u1EC3m ch\u1EE9ng \u2014 xem \`ganas trace --scope ${r.id}\``);
    lines.push("");
  }
  return lines.join("\n");
}
async function prompt2(question, fallback = "") {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = fallback ? ` [${fallback}]` : "";
    return (await rl.question(`${question}${suffix}: `)).trim() || fallback;
  } finally {
    rl.close();
  }
}
function slugify(text) {
  const full = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  let base2 = full;
  if (base2.length > SLUG_MAX) {
    const cut = base2.slice(0, SLUG_MAX);
    const lastBoundary = cut.lastIndexOf("-");
    base2 = (lastBoundary > 0 ? cut.slice(0, lastBoundary) : cut).replace(/-+$/, "");
  }
  return /^[a-z0-9]/.test(base2) ? base2 : `x-${base2}`;
}
function splitList(raw) {
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
function scopeYaml(a) {
  return `id: ${a.id}
title: ${JSON.stringify(a.title)}
version: 0.1.0
${a.owner ? `owner: "${a.owner}"` : `# owner: "@ten" \u2014 kh\xF4ng ai k\xFD th\xEC kh\xF4ng ai nghi\u1EC7m thu \u0111\u01B0\u1EE3c`}
status: active

# Ranh gi\u1EDBi code c\u1EE7a ph\u1EA1m vi. Fact/claim ch\u1EC9 \u0111\u01B0\u1EE3c coi l\xE0 \u0111\xFAng B\xCAN TRONG \u0111\xE2y.
modules:
${a.moduleIds.map((m) => `  - ${m}`).join("\n")}
entry: ${a.moduleIds[0]}

# Nghi\u1EC7m thu ch\u1EA1y tr\xEAn LU\u1ED2NG \u0110\xC3 GH\xC9P, kh\xF4ng ph\u1EA3i t\u1ED5ng nghi\u1EC7m thu t\u1EEBng kh\u1ED1i \u2014
# m\u1ED9t lu\u1ED3ng c\xF3 th\u1EC3 \u0111\xFAng \u1EDF t\u1EEBng kh\u1ED1i m\xE0 v\u1EABn sai khi gh\xE9p.
acceptance:
  - id: V-${a.id.replace(/^P-/, "")}-e2e
    kind: probe
    run: ${JSON.stringify(a.accept)}
`;
}
function moduleYaml(a) {
  return `id: ${a.id}
scope: ${a.scopeId}
title: ${JSON.stringify(a.title)}
# code | data | io | llm \u2014 kh\u1ED1i \`llm\` B\u1EAET BU\u1ED8C c\xF3 eval, probe kh\xF4ng ki\u1EC3m \u0111\u01B0\u1EE3c
# h\xE0nh vi c\u1EE7a LLM. Kh\u1ED1i \`io\` l\xE0 n\u01A1i CH\u1EA0M I/O th\u1EADt; l\xF5i kh\xF4ng t\u1EF1 m\u1EDF file, t\u1EF1 g\u1ECDi
# network hay t\u1EF1 query DB \u2014 xem .claude/rules/architecture.md.
nature: ${a.nature ?? "code"}
paths:
${a.paths.map((p) => `  - ${JSON.stringify(p)}`).join("\n")}
${a.dependsOn?.length ? `depends_on:
${a.dependsOn.map((d) => `  - ${d}`).join("\n")}
` : ""}status: surveyed
verify: []
`;
}
function looksLikeIoGlob(glob) {
  return IO_SEGMENT.test(glob.replace(/\*+/g, ""));
}
async function runNew(argv, root, graph) {
  const interactive = process.stdin.isTTY && !flag(argv, "yes", "y");
  const title = option(argv, "title") ?? (interactive ? await prompt2("B\xE0n giao c\xE1i g\xEC?") : "");
  if (!title) throw new GanasError(`thi\u1EBFu --title (b\xE0n giao c\xE1i g\xEC?)`);
  const pathsRaw = option(argv, "paths") ?? (interactive ? await prompt2("Code n\u1EB1m \u1EDF \u0111\xE2u? (glob, c\xE1ch nhau b\u1EDFi d\u1EA5u ph\u1EA9y)") : "");
  const paths = splitList(pathsRaw);
  if (paths.length === 0) throw new GanasError(`thi\u1EBFu --paths (code n\u1EB1m \u1EDF \u0111\xE2u?)`);
  const accept = option(argv, "accept") ?? (interactive ? await prompt2("L\xE0m sao bi\u1EBFt l\xE0 xong? (l\u1EC7nh)") : "");
  if (!accept) throw new GanasError(`thi\u1EBFu --accept (l\xE0m sao bi\u1EBFt l\xE0 xong?)`);
  const owner = option(argv, "owner") ?? (interactive ? await prompt2("Ai k\xFD nghi\u1EC7m thu?") : "");
  if (owner && !/^@[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(owner)) {
    throw new GanasError(`owner ph\u1EA3i d\u1EA1ng "@ten", nh\u1EADn \u0111\u01B0\u1EE3c "${owner}"`);
  }
  const suggested = `P-${slugify(title)}`;
  const id = option(argv, "id") ?? (interactive ? await prompt2("Id ph\u1EA1m vi?", suggested) : suggested);
  if (!ID_PATTERNS.scope.test(id)) {
    throw new GanasError(`id ph\u1EA1m vi ph\u1EA3i d\u1EA1ng "P-ten-ngan", nh\u1EADn \u0111\u01B0\u1EE3c "${id}"`);
  }
  if (graph.scopes.has(id)) throw new GanasError(`ph\u1EA1m vi ${id} \u0111\xE3 t\u1ED3n t\u1EA1i`);
  const reused = [...graph.modules.values()].filter((m) => m.value.paths.some((p) => paths.some((q) => p === q || matchesAny(p, [q])))).map((m) => m.value.id);
  const created = [];
  const stem = id.replace(/^P-/, "");
  const ioPaths = paths.filter(looksLikeIoGlob);
  const corePaths = paths.filter((p) => !looksLikeIoGlob(p));
  const split = reused.length === 0 && ioPaths.length > 0 && corePaths.length > 0;
  const moduleIds = reused.length > 0 ? reused : split ? [`M-${stem}`, `M-${stem}-io`] : [`M-${stem}`];
  if (reused.length === 0) {
    const write = async (mod) => {
      const file = ganasPath(root, DIRS.modules, `${mod.id}.yaml`);
      await mkdir4(dirname4(file), { recursive: true });
      await writeNewYaml(file, moduleYaml(mod), `kh\u1ED1i ${mod.id}`);
      created.push(relative3(root, file));
    };
    if (split) {
      await write({ id: `M-${stem}`, scopeId: id, title, paths: corePaths });
      await write({
        id: `M-${stem}-io`,
        scopeId: id,
        title: `${title} \u2014 I/O`,
        paths: ioPaths,
        nature: "io",
        dependsOn: [`M-${stem}`]
      });
    } else {
      await write({ id: moduleIds[0], scopeId: id, title, paths });
    }
  }
  const scopeFile = ganasPath(root, DIRS.scopes, `${id}.yaml`);
  await mkdir4(dirname4(scopeFile), { recursive: true });
  await writeNewYaml(
    scopeFile,
    scopeYaml({ id, title, owner, moduleIds, accept }),
    `ph\u1EA1m vi ${id}`
  );
  created.unshift(relative3(root, scopeFile));
  process.stdout.write(
    `\u0110\xE3 t\u1EA1o ph\u1EA1m vi ${id} \u2014 ${title}

` + created.map((f) => `  ${f}
`).join("") + (reused.length > 0 ? `
D\xF9ng l\u1EA1i kh\u1ED1i \u0111\xE3 c\xF3: ${reused.join(", ")} (paths giao v\u1EDBi glob v\u1EEBa khai).
  \u26A0 Kh\u1ED1i \u0111\xF3 \u0111ang khai \`scope\` kh\xE1c th\xEC ph\u1EA3i s\u1EEDa tay \u2014 hai chi\u1EC1u ph\u1EA3i kh\u1EDBp.
` : split ? `
T\xE1ch th\xE0nh HAI kh\u1ED1i theo lu\u1EADt ki\u1EBFn tr\xFAc (.claude/rules/architecture.md):
  \`M-${stem}\`    \u2014 l\xF5i (\`nature: code\`), kh\xF4ng t\u1EF1 ch\u1EA1m I/O
  \`M-${stem}-io\` \u2014 n\u01A1i ch\u1EA1m I/O th\u1EADt, \`depends_on: [M-${stem}]\`
Chia sai th\xEC \u0111\u1ED5i \`paths\`/\`nature\` b\u1EB1ng tay \u2014 ganas \u0111o\xE1n theo t\xEAn th\u01B0 m\u1EE5c.
` : `
Kh\u1ED1i \`${moduleIds[0]}\` \u0111\u01B0\u1EE3c t\u1EA1o v\u1EDBi \`nature: code\` (L\xD5I \u2014 kh\xF4ng t\u1EF1 m\u1EDF file,
t\u1EF1 g\u1ECDi network hay t\u1EF1 query DB). V\xF9ng ch\u1EA1m I/O ph\u1EA3i l\xE0 kh\u1ED1i \`nature: io\`
ri\xEAng; v\xF9ng c\xF3 G\u1ECCI LLM th\xEC \`nature: llm\`, v\xE0 khi \u0111\xF3 b\u1EAFt bu\u1ED9c ph\u1EA3i c\xF3 eval
v\xEC probe ki\u1EC3m \u0111\u01B0\u1EE3c c\u1EA5u tr\xFAc nh\u01B0ng kh\xF4ng ki\u1EC3m \u0111\u01B0\u1EE3c h\xE0nh vi c\u1EE7a LLM.
`) + `
Ti\u1EBFp theo: \`ganas validate\`, r\u1ED3i t\u1EA1o task trong .ganas/tasks/ khai \`scope: ${id}\`.
`
  );
  return 0;
}
async function scanMissing(root, graph) {
  const out = [];
  const pathsOf = /* @__PURE__ */ new Map();
  for (const [, m] of graph.modules) {
    if (m.value.scope) pathsOf.set(m.value.id, m.value.paths);
  }
  const scopeOfModule = (moduleId) => graph.modules.get(moduleId)?.value.scope;
  const guessByPath = (candidates2) => {
    const hits = /* @__PURE__ */ new Set();
    for (const [moduleId, globs] of pathsOf) {
      if (candidates2.some((p) => matchesAny(p, globs))) {
        const sc = scopeOfModule(moduleId);
        if (sc) hits.add(sc);
      }
    }
    return [...hits].sort();
  };
  for (const [dir, kind] of [
    [DIRS.facts, "fact"],
    [DIRS.claims, "claim"],
    [DIRS.tasks, "task"]
  ]) {
    const abs = ganasPath(root, dir);
    if (!existsSync8(abs)) continue;
    for (const entry of await readdir3(abs, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
      const file = join9(abs, entry.name);
      const doc = (0, import_yaml5.parseDocument)(await readFile9(file, "utf8"));
      const value = doc.toJS();
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        const rec = item;
        if (typeof rec["id"] !== "string" || rec["scope"] !== void 0) continue;
        const candidates2 = [];
        if (Array.isArray(rec["depends_on"])) {
          for (const g of rec["depends_on"]) if (typeof g === "string") candidates2.push(g);
        }
        if (Array.isArray(rec["anchors"])) {
          for (const a of rec["anchors"]) {
            if (typeof a === "string") candidates2.push(a.split("#")[0].split(":")[0]);
            else if (typeof a === "object" && a !== null) {
              const p = a["path"];
              if (typeof p === "string") candidates2.push(p);
            }
          }
        }
        let hints = guessByPath(candidates2);
        if (Array.isArray(rec["touches"])) {
          const viaTouches = /* @__PURE__ */ new Set();
          for (const m of rec["touches"]) {
            if (typeof m === "string") {
              const sc = scopeOfModule(m);
              if (sc) viaTouches.add(sc);
            }
          }
          if (viaTouches.size > 0) hints = [...viaTouches].sort();
        }
        out.push({ file: relative3(root, file), id: rec["id"], kind, hints });
      }
    }
  }
  return out;
}
async function fillScope(root, m, scopeId) {
  const abs = join9(root, m.file);
  const doc = (0, import_yaml5.parseDocument)(await readFile9(abs, "utf8"));
  const value = doc.toJS();
  if (Array.isArray(value)) {
    const idx = value.findIndex(
      (v) => typeof v === "object" && v !== null && v["id"] === m.id
    );
    if (idx === -1) return;
    doc.setIn([idx, "scope"], scopeId);
  } else {
    doc.setIn(["scope"], scopeId);
  }
  await writeFile4(abs, doc.toString(), "utf8");
}
async function runAssign(argv, root, graph) {
  const missing = await scanMissing(root, graph);
  const write = flag(argv, "write");
  if (missing.length === 0) {
    process.stdout.write(`M\u1ECDi fact/claim/task \u0111\u1EC1u \u0111\xE3 khai ph\u1EA1m vi.
`);
    return 0;
  }
  const resolved = missing.filter((m) => m.hints.length === 1);
  const ambiguous = missing.filter((m) => m.hints.length !== 1);
  const lines = [];
  if (resolved.length > 0) {
    lines.push(`${resolved.length} b\u1EA3n ghi suy \u0111\u01B0\u1EE3c ph\u1EA1m vi:`);
    for (const m of resolved) lines.push(`  ${m.id} (${m.kind}) \u2192 ${m.hints[0]}   ${m.file}`);
    lines.push("");
  }
  if (ambiguous.length > 0) {
    lines.push(`${ambiguous.length} b\u1EA3n ghi KH\xD4NG suy \u0111\u01B0\u1EE3c \u2014 ph\u1EA3i t\u1EF1 quy\u1EBFt:`);
    for (const m of ambiguous) {
      lines.push(
        `  ${m.id} (${m.kind}) \u2014 ${m.hints.length === 0 ? "kh\xF4ng kh\u1EDBp ph\u1EA1m vi n\xE0o" : `kh\u1EDBp nhi\u1EC1u: ${m.hints.join(", ")}`}   ${m.file}`
      );
    }
    lines.push("");
  }
  if (!write) {
    lines.push(`\u0110\xE2y l\xE0 dry-run. Ghi th\u1EADt: \`ganas scope assign --write\``);
    lines.push(`  (ch\u1EC9 ghi ${resolved.length} b\u1EA3n ghi suy \u0111\u01B0\u1EE3c; ph\u1EA7n m\u01A1 h\u1ED3 gi\u1EEF nguy\xEAn)`);
    process.stdout.write(lines.join("\n") + "\n");
    return 0;
  }
  for (const m of resolved) await fillScope(root, m, m.hints[0]);
  lines.push(`\u0110\xE3 ghi ${resolved.length} b\u1EA3n ghi. Ch\u1EA1y \`ganas validate\` \u0111\u1EC3 ki\u1EC3m l\u1EA1i.`);
  process.stdout.write(lines.join("\n") + "\n");
  return ambiguous.length > 0 ? 1 : 0;
}
async function run4(argv) {
  const sub = argv.positional[0];
  const { root, graph, freshness } = await openProject(argv);
  if (sub === "new") return runNew(argv, root, graph);
  if (sub === "assign") return runAssign(argv, root, graph);
  if (sub !== void 0) {
    throw new GanasError(`l\u1EC7nh con kh\xF4ng bi\u1EBFt: "${sub}" \u2014 c\xF3: new, assign`);
  }
  const rows = rowsOf(graph, freshness);
  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    return 0;
  }
  process.stdout.write(formatRows(rows));
  return 0;
}
var import_yaml5, SLUG_MAX, IO_SEGMENT;
var init_scope2 = __esm({
  "src/commands/scope.ts"() {
    "use strict";
    import_yaml5 = __toESM(require_dist(), 1);
    init_paths();
    init_trace();
    init_model();
    init_args();
    init_errors();
    init_glob();
    init_common2();
    SLUG_MAX = 40;
    IO_SEGMENT = /(^|\/)(io|store|stores|adapter|adapters|infra|infrastructure|repo|repository|repositories|gateway|client|clients)(\/|$)/;
  }
});

// src/graph/claim.ts
import { mkdir as mkdir5, open, readdir as readdir4, readFile as readFile10, rm as rm2, stat as stat2 } from "node:fs/promises";
import { dirname as dirname5 } from "node:path";
function claimFile(root, taskId) {
  return ganasPath(root, DIRS.locks, `${taskId}.claim`);
}
function idFile(root, id) {
  return ganasPath(root, DIRS.locks, `${id}.id`);
}
function isStale(claim, ttlMinutes) {
  const claimedAt = new Date(claim.claimed_at).getTime();
  if (Number.isNaN(claimedAt)) return true;
  return Date.now() - claimedAt > ttlMinutes * 6e4;
}
async function readClaimFile(file) {
  try {
    const raw = await readFile10(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function createClaimFile(file, claim) {
  try {
    const handle = await open(file, "wx");
    try {
      await handle.writeFile(JSON.stringify(claim));
    } finally {
      await handle.close();
    }
    return true;
  } catch (err) {
    if (err.code === "EEXIST") return false;
    throw err;
  }
}
async function acquireLock(file, sessionId, ttlMinutes, sameSessionKeeps) {
  await mkdir5(dirname5(file), { recursive: true });
  const claim = { session_id: sessionId, claimed_at: (/* @__PURE__ */ new Date()).toISOString() };
  if (await createClaimFile(file, claim)) return true;
  const existing = await readClaimFile(file);
  if (!existing) return createClaimFile(file, claim);
  if (existing.session_id === sessionId && sameSessionKeeps) return true;
  if (!isStale(existing, ttlMinutes)) return false;
  await rm2(file, { force: true });
  return createClaimFile(file, claim);
}
async function claimTask(root, taskId, sessionId, ttlMinutes) {
  return acquireLock(claimFile(root, taskId), sessionId, ttlMinutes, true);
}
async function reserveId(root, id, sessionId, ttlMinutes) {
  return acquireLock(idFile(root, id), sessionId, ttlMinutes, false);
}
async function withFileLock(lockFile, ttlMs, fn) {
  await mkdir5(dirname5(lockFile), { recursive: true });
  const giveUpAfterMs = ttlMs * 5;
  const waitStartedAt = Date.now();
  for (; ; ) {
    try {
      const handle = await open(lockFile, "wx");
      await handle.close();
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const info = await stat2(lockFile).catch(() => null);
      if (!info || Date.now() - info.mtimeMs > ttlMs) {
        await rm2(lockFile, { force: true });
        continue;
      }
      if (Date.now() - waitStartedAt > giveUpAfterMs) {
        throw new Error(
          `withFileLock: kh\xF4ng gi\xE0nh \u0111\u01B0\u1EE3c kho\xE1 ${lockFile} sau ${giveUpAfterMs}ms \u2014 c\xF3 ti\u1EBFn tr\xECnh kh\xE1c \u0111ang gi\u1EEF n\xF3 l\xE2u b\u1EA5t th\u01B0\u1EDDng.`,
          { cause: err }
        );
      }
      await new Promise((resolve4) => setTimeout(resolve4, LOCK_POLL_MS));
    }
  }
  try {
    return await fn();
  } finally {
    await rm2(lockFile, { force: true });
  }
}
async function claimNextTask(graph, root, sessionId, opts = {}) {
  const ttlMinutes = graph.config.claim.ttl_minutes;
  for (const candidate of rankedCandidates(graph, opts)) {
    if (await claimTask(root, candidate.task.value.id, sessionId, ttlMinutes)) return candidate;
  }
  return null;
}
async function releaseClaimsForSession(root, sessionId) {
  const dir = ganasPath(root, DIRS.locks);
  let entries;
  try {
    entries = await readdir4(dir);
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (name) => {
      const suffix = LOCK_SUFFIXES.find((s) => name.endsWith(s));
      if (!suffix) return;
      const file = ganasPath(root, DIRS.locks, name);
      const claim = await readClaimFile(file);
      if (claim?.session_id === sessionId) await rm2(file, { force: true });
    })
  );
}
var LOCK_POLL_MS, LOCK_SUFFIXES;
var init_claim = __esm({
  "src/graph/claim.ts"() {
    "use strict";
    init_paths();
    init_select();
    LOCK_POLL_MS = 20;
    LOCK_SUFFIXES = [".claim", ".id"];
  }
});

// src/commands/id.ts
var id_exports = {};
__export(id_exports, {
  run: () => run5
});
import { basename as basename2 } from "node:path";
function isNumberedKind(s) {
  return NUMBERED_KINDS.includes(s);
}
function idsOf(graph, kind) {
  switch (kind) {
    case "goal":
      return graph.goals.keys();
    case "design":
      return graph.designs.keys();
    case "task":
      return graph.tasks.keys();
    case "claim":
      return graph.claims.keys();
    case "decision":
      return graph.decisions.keys();
    case "fact":
      return graph.facts.keys();
    case "icebox":
      return graph.icebox.keys();
  }
}
function pad(n) {
  return String(n).padStart(3, "0");
}
function topLevelId(record2) {
  if (record2 === null || typeof record2 !== "object" || Array.isArray(record2)) return void 0;
  const id = record2.id;
  return typeof id === "string" ? id : void 0;
}
function rawDeclaredIds(graph) {
  const ids = /* @__PURE__ */ new Set();
  for (const loaded of graph.sources.values()) {
    const records = Array.isArray(loaded.value) ? loaded.value : [loaded.value];
    for (const record2 of records) {
      const id = topLevelId(record2);
      if (id) ids.add(id);
    }
  }
  const idPatterns = Object.values(ID_PATTERNS);
  for (const diag of graph.loadDiagnostics) {
    if (diag.code !== "load/yaml") continue;
    const guess = basename2(diag.file).replace(/\.ya?ml$/, "");
    if (idPatterns.some((pattern) => pattern.test(guess))) ids.add(guess);
  }
  return ids;
}
function maxNumber(ids, pattern, prefix) {
  let max = 0;
  for (const id of ids) {
    if (!pattern.test(id)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}
function maxFactNumber(graph, group, extraIds) {
  const prefix = `F-${group}-`;
  let max = 0;
  for (const id of [...graph.facts.keys(), ...extraIds]) {
    if (!ID_PATTERNS.fact.test(id) || !id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}
async function run5(argv) {
  const kindRaw = argv.positional[0];
  if (!kindRaw) {
    throw new GanasError(
      `thi\u1EBFu lo\u1EA1i ID \u2014 d\xF9ng: ganas id <goal|design|task|claim|decision|fact|icebox> [--count n] [--group nh\xF3m]`
    );
  }
  if (SLUG_KINDS.has(kindRaw)) {
    throw new GanasError(
      `"${kindRaw}" \u0111\u1EB7t t\xEAn theo \xDD NGH\u0128A (slug), kh\xF4ng theo s\u1ED1 \u2014 kh\xF4ng c\xF3 "id k\u1EBF ti\u1EBFp" n\xE0o \u0111\u1EC3 c\u1EA5p.
  D\xF9ng \`ganas scope new\` \u2014 n\xF3 t\u1EF1 sinh slug qua slugify() (src/commands/scope.ts:161).`
    );
  }
  if (!isNumberedKind(kindRaw)) {
    throw new GanasError(
      `kh\xF4ng c\xF3 lo\u1EA1i "${kindRaw}" \u2014 nh\u1EADn: goal, design, task, claim, decision, fact, icebox`
    );
  }
  const kind = kindRaw;
  let group;
  if (kind === "fact") {
    group = option(argv, "group");
    if (!group) {
      throw new GanasError(
        `fact b\u1EAFt bu\u1ED9c --group (id fact d\u1EA1ng F-<NH\xD3M>-003, xem ID_PATTERNS.fact) \u2014 vd: ganas id fact --group ACC`
      );
    }
    if (!/^[A-Z0-9]+$/.test(group)) {
      throw new GanasError(`--group ph\u1EA3i kh\u1EDBp ^[A-Z0-9]+$, nh\u1EADn \u0111\u01B0\u1EE3c "${group}"`);
    }
  }
  const countRaw = option(argv, "count");
  const count = countRaw === void 0 ? 1 : Number(countRaw);
  if (!Number.isInteger(count) || count < 1) {
    throw new GanasError(`--count ph\u1EA3i l\xE0 s\u1ED1 nguy\xEAn d\u01B0\u01A1ng, nh\u1EADn \u0111\u01B0\u1EE3c "${countRaw}"`);
  }
  const { root, graph } = await openProject(argv);
  const rawIds = rawDeclaredIds(graph);
  const start = kind === "fact" ? maxFactNumber(graph, group, rawIds) + 1 : maxNumber([...idsOf(graph, kind), ...rawIds], ID_PATTERNS[kind], PREFIX[kind]) + 1;
  const sessionId = option(argv, "session") ?? "cli";
  const ttlMinutes = graph.config.claim.ttl_minutes;
  const ids = [];
  const maxAttempts = count + 1e3;
  let n = start;
  for (let attempts = 0; attempts < maxAttempts && ids.length < count; attempts++, n++) {
    const candidate = kind === "fact" ? `F-${group}-${pad(n)}` : `${PREFIX[kind]}${pad(n)}`;
    if (await reserveId(root, candidate, sessionId, ttlMinutes)) ids.push(candidate);
  }
  if (ids.length < count) {
    throw new GanasError(
      `ch\u1EC9 \u0111\u1EB7t ch\u1ED7 \u0111\u01B0\u1EE3c ${ids.length}/${count} id cho "${kind}" sau ${maxAttempts} l\u1EA7n th\u1EED \u2014 qu\xE1 nhi\u1EC1u s\u1ED1 \u1EE9ng vi\xEAn \u0111ang b\u1ECB phi\xEAn kh\xE1c gi\u1EEF ch\u1ED7 trong .ganas/.locks/. Th\u1EED l\u1EA1i sau, ho\u1EB7c ki\u1EC3m tra c\xF3 phi\xEAn n\xE0o \u0111ang treo gi\u1EEF ch\u1ED7 h\xE0ng lo\u1EA1t kh\xF4ng.`
    );
  }
  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ kind, ...group ? { group } : {}, ids }, null, 2) + "\n");
    return 0;
  }
  process.stdout.write(ids.join("\n") + "\n");
  return 0;
}
var NUMBERED_KINDS, SLUG_KINDS, PREFIX;
var init_id = __esm({
  "src/commands/id.ts"() {
    "use strict";
    init_claim();
    init_model();
    init_args();
    init_errors();
    init_common2();
    NUMBERED_KINDS = ["goal", "design", "task", "claim", "decision", "fact", "icebox"];
    SLUG_KINDS = /* @__PURE__ */ new Set(["module", "scope", "verification"]);
    PREFIX = {
      goal: "G-",
      design: "D-",
      task: "T-",
      claim: "C-",
      decision: "DEC-",
      icebox: "ICE-"
    };
  }
});

// src/search.ts
function tokenize(text) {
  const normalized = text.toLowerCase().replace(D_WITH_STROKE, "d").replace(D_WITH_STROKE_UPPER, "d").normalize("NFD").replace(COMBINING_MARKS, "");
  const tokens = [];
  for (const compound of normalized.match(COMPOUND) ?? []) {
    if (compound.length >= MIN_TOKEN_LEN) tokens.push(compound);
    if (SEPARATOR.test(compound)) {
      for (const frag of compound.split(SEPARATOR)) {
        if (frag.length >= MIN_TOKEN_LEN) tokens.push(frag);
      }
    }
  }
  return tokens;
}
function factDocument(fact) {
  const parts = [fact.statement, fact.notes ?? "", fact.verify.run, ...fact.depends_on];
  return parts.join(" \n ");
}
function buildDoc(factId, fact, file) {
  const tokens = tokenize(factDocument(fact));
  const termFreq = /* @__PURE__ */ new Map();
  for (const t of tokens) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
  return { factId, fact, file, termFreq, length: tokens.length };
}
function idf(df, n) {
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}
function searchFacts(graph, query, opts = {}) {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const exclude = new Set(opts.exclude ?? []);
  const docs = [];
  for (const [factId, sourced] of graph.facts) {
    if (exclude.has(factId)) continue;
    if (opts.scope !== void 0 && sourced.value.scope !== opts.scope) continue;
    docs.push(buildDoc(factId, sourced.value, sourced.file));
  }
  if (docs.length === 0) return [];
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) return [];
  const minMatched = opts.minMatchedTerms ?? (queryTerms.length === 1 ? 1 : DEFAULT_MIN_MATCHED_TERMS);
  const n = docs.length;
  const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / n;
  const df = /* @__PURE__ */ new Map();
  for (const term of queryTerms) {
    let count = 0;
    for (const doc of docs) if (doc.termFreq.has(term)) count++;
    df.set(term, count);
  }
  const hits = [];
  for (const doc of docs) {
    let score = 0;
    const matchedTerms = [];
    for (const term of queryTerms) {
      const f = doc.termFreq.get(term) ?? 0;
      if (f === 0) continue;
      matchedTerms.push(term);
      const termIdf = idf(df.get(term), n);
      const denom = f + K1 * (1 - B + B * (doc.length / (avgLength || 1)));
      score += termIdf * (f * (K1 + 1) / denom);
    }
    if (matchedTerms.length < minMatched) continue;
    hits.push({ factId: doc.factId, score, matchedTerms, fact: doc.fact, file: doc.file });
  }
  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.factId < b.factId ? -1 : a.factId > b.factId ? 1 : 0;
  });
  return hits.slice(0, limit);
}
function taskQuery(task) {
  const parts = [
    task.title,
    ...task.context_contract.must_read.map((m) => m.path),
    ...task.context_contract.open_questions
  ];
  return parts.join(" \n ");
}
var COMBINING_MARKS, D_WITH_STROKE, D_WITH_STROKE_UPPER, COMPOUND, SEPARATOR, MIN_TOKEN_LEN, K1, B, DEFAULT_LIMIT, DEFAULT_MIN_MATCHED_TERMS;
var init_search = __esm({
  "src/search.ts"() {
    "use strict";
    COMBINING_MARKS = new RegExp("\\p{M}", "gu");
    D_WITH_STROKE = /đ/g;
    D_WITH_STROKE_UPPER = /Đ/g;
    COMPOUND = /[a-z0-9]+(?:[-_./][a-z0-9]+)*/g;
    SEPARATOR = /[-_./]/;
    MIN_TOKEN_LEN = 2;
    K1 = 1.2;
    B = 0.75;
    DEFAULT_LIMIT = 10;
    DEFAULT_MIN_MATCHED_TERMS = 2;
  }
});

// src/render/group.ts
function renderGroupedByScope(graph, items, taskOf, renderTask) {
  const byScope = /* @__PURE__ */ new Map();
  for (const item of items) {
    const t = taskOf(item);
    let byDesign = byScope.get(t.scope);
    if (!byDesign) {
      byDesign = /* @__PURE__ */ new Map();
      byScope.set(t.scope, byDesign);
    }
    let group = byDesign.get(t.implements);
    if (!group) {
      group = [];
      byDesign.set(t.implements, group);
    }
    group.push(item);
  }
  const lines = [];
  for (const [scopeId, byDesign] of byScope) {
    const scope = graph.scopes.get(scopeId)?.value;
    lines.push(scope ? `${scopeId} \u2014 ${scope.title}` : scopeId);
    for (const [designId, group] of byDesign) {
      const design = graph.designs.get(designId)?.value;
      lines.push(`  ${design ? `${designId} \u2014 ${design.title}` : designId}`);
      for (const item of group) {
        for (const line of renderTask(item).split("\n")) lines.push(`    ${line}`);
      }
    }
  }
  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}
var init_group = __esm({
  "src/render/group.ts"() {
    "use strict";
  }
});

// src/render/brief.ts
import { existsSync as existsSync9 } from "node:fs";
import { join as join10 } from "node:path";
function relevantLegacyClaims(graph, task) {
  const paths = new Set(task.context_contract.must_read.map((m) => m.path));
  const out = [];
  for (const sourced of graph.claims.values()) {
    const c = sourced.value;
    if (c.provenance !== "imported" || c.trust !== "unverified") continue;
    if (c.scope !== task.scope) continue;
    const touches = c.anchors.some((a) => a.kind === "file" && paths.has(a.path));
    if (touches) out.push(c);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
function bullet(lines) {
  return lines.map((l) => `- ${l}`).join("\n");
}
function truncateStatement(s, max = 90) {
  return s.length > max ? `${s.slice(0, max).trimEnd()}\u2026` : s;
}
function suggestedFactsSection(graph, freshness, t) {
  const hits = searchFacts(graph, taskQuery(t), {
    scope: t.scope,
    exclude: t.context_contract.facts,
    limit: Number.MAX_SAFE_INTEGER
  });
  if (hits.length === 0) return "";
  const shown = hits.slice(0, SUGGESTED_FACTS_LIMIT);
  const omitted = hits.length - shown.length;
  const lines = shown.map((h) => {
    const mark = freshnessMark(freshness.get(h.factId));
    return `${mark} \`${h.factId}\` \u2014 ${truncateStatement(h.fact.statement)}`;
  });
  const note = omitted > 0 ? `

\u2026 c\xF2n ${omitted} fact kh\xE1c kh\u1EDBp, ch\u01B0a in \u2014 d\xF9ng \`ganas search --task ${t.id}\` \u0111\u1EC3 xem h\u1EBFt.` : "";
  return `## C\xF3 th\u1EC3 li\xEAn quan \u2014 g\u1EE3i \xFD t\u1EF1 \u0111\u1ED9ng, CH\u01AFA ai x\xE1c nh\u1EADn

M\xE1y kh\u1EDBp CH\u1EEE (BM25) tr\xEAn fact c\xF9ng ph\u1EA1m vi m\xE0 task kh\xF4ng khai tay. Kh\xE1c m\u1EE5c "Tri th\u1EE9c d\xF9ng \u0111\u01B0\u1EE3c" \u1EDF tr\xEAn: \u1EDF \u0111\xF3 c\xF3 ng\u01B0\u1EDDi x\xE1c nh\u1EADn l\xE0 li\xEAn quan, \u1EDF \u0111\xE2y th\xEC kh\xF4ng \u2014 ki\u1EC3m (\`ganas verify <id>\`) tr\u01B0\u1EDBc khi d\u1EF1a v\xE0o:

` + bullet(lines) + note;
}
function overdueIceboxSection(graph, t, now) {
  const overdue = [...graph.icebox.values()].map((s) => s.value).filter((i) => i.status === "open" && i.scope === t.scope).map((i) => {
    const dueAt = Date.parse(i.found_at) + i.review_after_days * DAY_MS;
    return { i, overdueDays: Math.floor((now - dueAt) / DAY_MS) };
  }).filter((x) => x.overdueDays > 0).sort((a, b) => b.overdueDays - a.overdueDays || a.i.id.localeCompare(b.i.id));
  if (overdue.length === 0) return "";
  const shown = overdue.slice(0, ICEBOX_OVERDUE_LIMIT);
  const omitted = overdue.length - shown.length;
  const lines = shown.map(
    ({ i, overdueDays }) => `\`${i.id}\` \u2014 ${i.title} \u2014 qu\xE1 h\u1EA1n xem l\u1EA1i ${overdueDays} ng\xE0y \u2014 t\u1ED5ng \u0111i\u1EC3m ${i.weight + i.ease}`
  );
  const note = omitted > 0 ? `

\u2026 c\xF2n ${omitted} m\u1EE5c icebox qu\xE1 h\u1EA1n kh\xE1c, ch\u01B0a in \u2014 d\xF9ng \`ganas icebox review\` \u0111\u1EC3 xem h\u1EBFt.` : "";
  return `## Icebox qu\xE1 h\u1EA1n xem l\u1EA1i

\u0110\xE2y l\xE0 vi\u1EC7c **\u0111\xE3 c\xF3 ng\u01B0\u1EDDi quy\u1EBFt \u0111\u1ECBnh ho\xE3n**, kh\xF4ng ph\u1EA3i vi\u1EC7c ph\u1EA3i l\xE0m b\xE2y gi\u1EDD. M\u1ED1c h\u1EB9n xem l\u1EA1i quy\u1EBFt \u0111\u1ECBnh \u0111\xF3 \u0111\xE3 qua \u2014 kh\xF4ng t\u1EF1 \xFD l\xE0m, c\u0169ng kh\xF4ng t\u1EF1 \xFD b\u1ECF; x\xE1c nh\u1EADn l\u1EA1i l\xFD do ho\xE3n (\`why_deferred\`) c\xF2n \u0111\xFAng kh\xF4ng, qua \`ganas icebox review\` (in k\xE8m anchor t\u1EDBi code) ho\u1EB7c \u0111\u1ECDc th\u1EB3ng file trong \`.ganas/icebox/\`:

` + bullet(lines) + note;
}
function findSupersededBy(graph, designId) {
  for (const sourced of graph.designs.values()) {
    if (sourced.value.supersedes.includes(designId)) return sourced.value.id;
  }
  return void 0;
}
function dispatchSection(graph, t) {
  const H = `## Giao vi\u1EC7c`;
  if (!t.model) {
    return `${H} \u2014 \u26A0 ch\u01B0a ai quy\u1EBFt ai l\xE0m

Task n\xE0y ch\u01B0a g\xE1n \`model\`. Ngh\u0129a l\xE0 l\xFAc ch\u1EBB task kh\xF4ng ai quy\u1EBFt n\xF3 kh\xF3 t\u1EDBi \u0111\xE2u, n\xEAn m\u1EB7c \u0111\u1ECBnh phi\xEAn ch\xEDnh \xF4m h\u1EBFt b\u1EB1ng model m\u1EA1nh nh\u1EA5t \u2014 k\u1EC3 c\u1EA3 vi\u1EC7c c\u01A1 h\u1ECDc.

S\u1EEDa file task trong \`.ganas/tasks/\`, th\xEAm m\u1ED9t d\xF2ng:

\`\`\`yaml
model: main   # main = kh\xF3/m\u01A1 h\u1ED3 \xB7 verifier = kho\u1EA3ng gi\u1EEFa \xB7 scribe = c\u01A1 h\u1ECDc
\`\`\`

R\u1ED3i \`ganas validate\` (lu\u1EADt \`spine/task-missing-model\`). Kh\xF4ng \u0111o\xE1n h\u1ED9 \u1EDF \u0111\xE2y: heuristic suy tier kh\xF4ng \u0111\xE1ng tin b\u1EB1ng ng\u01B0\u1EDDi v\u1EEBa ch\u1EBB task.`;
  }
  const modelId = graph.config.models[t.model];
  if (!canDispatchSubagent(graph.config.harness)) {
    return `${H}

Tier \`${t.model}\` \u2192 model \`${modelId}\`.

Harness khai trong \`config.yaml\` l\xE0 \`${graph.config.harness}\`: ganas n\u1ED1i v\xE0o \u0111\xF3 qua MCP, m\xE0 MCP kh\xF4ng t\u1EA1o \u0111\u01B0\u1EE3c agent con v\xE0 kh\xF4ng \u0111\u1ED5i \u0111\u01B0\u1EE3c model c\u1EE7a phi\xEAn. \u0110\u1ED5i model sang \`${modelId}\` trong picker tr\u01B0\u1EDBc khi l\xE0m, ho\u1EB7c m\u1EDF m\u1ED9t phi\xEAn ri\xEAng b\u1EB1ng model \u0111\xF3.

> **\u0110\xE2y l\xE0 khuy\u1EBFn ngh\u1ECB, kh\xF4ng ph\u1EA3i h\xE0ng r\xE0o** \u2014 ganas kh\xF4ng ki\u1EC3m \u0111\u01B0\u1EE3c b\u1EA1n c\xF3 \u0111\u1ED5i hay kh\xF4ng. \u0110\u1EEBng ghi v\xE0o \`.ganas/\` r\u1EB1ng task \u0111\xE3 ch\u1EA1y \u0111\xFAng tier.`;
  }
  const alias = agentModelAlias(modelId);
  const modelArg = alias ? `\`model: "${alias}"\`` : `model \`${modelId}\``;
  return `${H} \u2014 task n\xE0y KH\xD4NG ch\u1EA1y th\u1EB3ng \u1EDF phi\xEAn ch\xEDnh

Tier \`${t.model}\` \u2192 model \`${modelId}\` (${modelArg}).

Phi\xEAn ch\xEDnh l\xE0 ng\u01B0\u1EDDi \u0110I\u1EC0U PH\u1ED0I: ch\u1ECDn task, \u0111\u1ECDc brief, giao vi\u1EC7c, ch\u1EA5m gate, commit. Ph\u1EA7n s\u1EEDa code c\u1EE7a task n\xE0y ch\u1EA1y trong sub-agent ri\xEAng:

` + bullet([
    `T\u1EA1o sub-agent v\u1EDBi ${modelArg}.`,
    `Prompt m\u1EDF \u0111\u1EA7u b\u1EB1ng \`ganas brief ${t.id}\` \u2014 \u0111\u1EC3 sub-agent t\u1EF1 l\u1EA5y \u0111\xFAng brief n\xE0y, \u0111\u1EEBng ch\xE9p tay l\u1EA1i (ch\xE9p tay l\xE0 ch\u1ED7 brief b\u1ECB b\xF3p m\xE9o).`,
    `Sub-agent xong th\xEC phi\xEAn ch\xEDnh ch\u1EA1y \`ganas gate\` \u0111\u1EC3 ch\u1EA5m. Ch\u1EA5m b\u1EB1ng l\u1EC7nh, kh\xF4ng b\u1EB1ng l\u1EDDi t\u1ED5ng k\u1EBFt c\u1EE7a sub-agent.`
  ]) + `

Hai l\xFD do, kh\xF4ng ph\u1EA3i m\u1ED9t: context phi\xEAn ch\xEDnh kh\xF4ng b\u1ECB chi ti\u1EBFt th\u1EF1c thi nu\u1ED1t m\u1EA5t, v\xE0 tier th\u1EA5p kh\xF4ng ngh\u0129 qu\xE1 tay cho vi\u1EC7c c\u01A1 h\u1ECDc.

` + parallelBlock(graph, t) + `> N\u1EBFu B\u1EA0N \u0110ANG L\xC0 sub-agent nh\u1EADn ch\xEDnh task n\xE0y: l\xE0m lu\xF4n, \u0111\u1EEBng giao ti\u1EBFp n\u1EEFa.`;
}
function parallelBlock(graph, t) {
  const others = parallelCandidates(graph, t);
  if (others.length === 0) return "";
  const grouped = renderGroupedByScope(
    graph,
    others,
    (o) => o.value,
    (o) => {
      const task = o.value;
      const tier = task.model ? `tier \`${task.model}\`` : `\u26A0 ch\u01B0a g\xE1n model`;
      const alias = task.model ? agentModelAlias(graph.config.models[task.model]) : void 0;
      return `\`${task.id}\` \u2014 ${task.title}
  ${tier}${alias ? ` \u2192 \`model: "${alias}"\`` : ""} \xB7 kh\u1ED1i ${task.touches.map((m) => `\`${m}\``).join(", ")}`;
    }
  );
  return `**Giao \u0111\u01B0\u1EE3c song song ngay b\xE2y gi\u1EDD** \u2014 c\xE1c task d\u01B0\u1EDBi \u0111\xE2y kh\xF4ng ch\u1EB7n nhau v\xE0 KH\xD4NG \u0111\u1EE5ng c\xF9ng v\xF9ng code v\u1EDBi task n\xE0y. M\u1EDF m\u1ED7i c\xE1i m\u1ED9t sub-agent ri\xEAng, c\xF9ng l\xFAc, m\u1ED7i sub-agent t\u1EF1 ch\u1EA1y \`ganas brief <id>\` tr\u01B0\u1EDBc khi s\u1EEDa g\xEC:

` + grouped + `
Ch\u1EA5m t\u1EEBng c\xE1i b\u1EB1ng \`ganas gate <id>\` sau khi sub-agent t\u01B0\u01A1ng \u1EE9ng xong. **Ch\u1EC9 nh\u1EEFng task c\xF3 t\xEAn \u1EDF \u0111\xE2y** \u2014 task kh\xE1c ch\u1EA1m c\xF9ng v\xF9ng code, giao song song th\xEC s\u1EEDa \u0111\u1ED5i c\u1EE7a agent n\xE0y b\u1ECB agent kia \u0111\xE8 m\xE0 kh\xF4ng ai th\u1EA5y.

`;
}
function renderBrief(input) {
  const { graph, task: sourced, freshness } = input;
  const now = input.now ?? Date.now();
  const t = sourced.value;
  const parts = [];
  const design = graph.designs.get(t.implements);
  parts.push(
    `# ${t.id} \u2014 ${t.title}

ph\u1EA1m vi \`${t.scope}\` \xB7 design \`${t.implements}\` \xB7 ph\u1EE5c v\u1EE5 ${t.serves.map((g) => `\`${g}\``).join(", ")}` + (t.status === "in_progress" ? `

**\u0110\xE2y l\xE0 vi\u1EC7c \u0111ang d\u1EDF** \u2014 n\u1ED1i ti\u1EBFp, \u0111\u1EEBng b\u1EAFt \u0111\u1EA7u l\u1EA1i.` : "")
  );
  const blockers = openBlockers(graph, t);
  if (blockers.length > 0) {
    parts.push(
      `> \u26D4 Task n\xE0y \u0111ang b\u1ECB ch\u1EB7n b\u1EDFi: ${blockers.join(", ")}.
> L\xE0m xong nh\u1EEFng task \u0111\xF3 tr\u01B0\u1EDBc, ho\u1EB7c b\xE1o l\u1EA1i cho ng\u01B0\u1EDDi ph\u1EE5 tr\xE1ch.`
    );
  }
  const scope = graph.scopes.get(t.scope);
  if (!scope) {
    parts.push(
      `## Ph\u1EA1m vi c\xF4ng vi\u1EC7c

\u26A0 Task khai \`scope: ${t.scope}\` nh\u01B0ng ph\u1EA1m vi \u0111\xF3 **KH\xD4NG T\u1ED2N T\u1EA0I** (graph \u0111ang h\u1ECFng, ch\u1EA1y \`ganas validate\`).`
    );
  } else {
    const sc = scope.value;
    const members = sc.modules.map((id) => {
      const mod = graph.modules.get(id)?.value;
      const where = mod ? [...mod.paths, ...mod.entrypoints] : [];
      return `\`${id}\`${mod ? ` \u2014 ${mod.title}` : " \u2014 \u26A0 KH\xD4NG T\xCCM TH\u1EA4Y"}` + (where.length ? `
  ${where.map((p) => `\`${p}\``).join(", ")}` : "");
    });
    const acceptance = sc.acceptance.map((a) => {
      const info = freshness.get(`${sc.id}/${a.id}`);
      const state = info ? `${info.freshness} \u2014 ${info.reason}` : "ch\u01B0a t\xEDnh \u0111\u01B0\u1EE3c \u0111\u1ED9 t\u01B0\u01A1i";
      return `\`${a.id}\` (${a.kind}) \u2014 ${state}`;
    });
    parts.push(
      `## Ph\u1EA1m vi c\xF4ng vi\u1EC7c

### ${sc.id} \u2014 ${sc.title}

phi\xEAn b\u1EA3n \`${sc.version}\` \xB7 tr\u1EA1ng th\xE1i \`${sc.status}\`` + (sc.owner ? ` \xB7 nghi\u1EC7m thu: ${sc.owner}` : " \xB7 \u26A0 ch\u01B0a ai k\xFD nghi\u1EC7m thu") + // Bối cảnh phạm vi — cái gì trong, cái gì ngoài, đã hỏi ai. Đặt TRƯỚC
      // ranh giới code: nó là thứ định khung cho mọi thứ đọc sau đó.
      (sc.notes ? `

${sc.notes.trim()}` : "") + `

**Ranh gi\u1EDBi code:**
${bullet(members)}` + (acceptance.length ? `

**Nghi\u1EC7m thu lu\u1ED3ng gh\xE9p:**
${bullet(acceptance)}` : `

\u26A0 Ph\u1EA1m vi n\xE0y ch\u01B0a c\xF3 ti\xEAu ch\xED nghi\u1EC7m thu n\xE0o \u2014 "b\xE0n giao xong" s\u1EBD l\xE0 \xFD ki\u1EBFn.`) + `

> M\u1ECDi ph\xE1t bi\u1EC3u b\xEAn d\u01B0\u1EDBi ch\u1EC9 \u0111\u01B0\u1EE3c coi l\xE0 \u0111\xFAng **trong ph\u1EA1m vi n\xE0y**.
> Ra ngo\xE0i l\xE0 **ch\u01B0a bi\u1EBFt** \u2014 kh\xF4ng ph\u1EA3i sai, m\xE0 l\xE0 ch\u01B0a ai ki\u1EC3m.`
    );
  }
  const goalBlocks = [];
  for (const goalId of t.serves) {
    const goal = graph.goals.get(goalId)?.value;
    if (!goal) {
      goalBlocks.push(
        `### ${goalId} \u2014 \u26A0 KH\xD4NG T\xCCM TH\u1EA4Y (graph \u0111ang h\u1ECFng, ch\u1EA1y \`ganas validate\`)`
      );
      continue;
    }
    const criteria = goal.acceptance.map(
      (a) => a.kind === "command" ? `\`${a.run}\`` : `${a.check} \u2014 ng\u01B0\u1EDDi x\xE1c nh\u1EADn: ${a.owner}`
    );
    goalBlocks.push(
      `### ${goal.id} \u2014 ${goal.title}

K\u1EBFt qu\u1EA3 mong \u0111\u1EE3i: ${goal.outcome}

Nghi\u1EC7m thu:
${bullet(criteria)}`
    );
  }
  parts.push(`## M\u1EE5c ti\xEAu \u0111ang ph\u1EE5c v\u1EE5

${goalBlocks.join("\n\n")}`);
  if (design) {
    const d = design.value;
    let warning = "";
    if (d.status === "superseded") {
      const supersededBy = findSupersededBy(graph, d.id);
      warning = `

> \u26A0 **Design n\xE0y \u0111\xE3 b\u1ECB thay th\u1EBF** \u2014 hi\u1EC7n th\u1EF1c n\xF3 l\xE0 hi\u1EC7n th\u1EF1c m\u1ED9t h\u01B0\u1EDBng \u0111\xE3 b\u1ECB b\u1ECF, ` + (supersededBy ? `thay b\u1EDFi \`${supersededBy}\`. \u0110\u1ECDc \`${supersededBy}\` tr\u01B0\u1EDBc khi vi\u1EBFt d\xF2ng n\xE0o, \u0111\u1EEBng l\xE0m theo c\xE1i \u0111\xE3 ch\u1EBFt.` : `nh\u01B0ng kh\xF4ng tra \u0111\u01B0\u1EE3c design n\xE0o khai \u0111\xE3 thay n\xF3 (kh\xF4ng c\xF3 c\u1EA1nh ng\u01B0\u1EE3c \`superseded_by\` trong model). H\u1ECFi ng\u01B0\u1EDDi ph\u1EE5 tr\xE1ch tr\u01B0\u1EDBc khi ti\u1EBFp t\u1EE5c.`);
    } else if (d.status === "archived") {
      warning = `

> \u26A0 **Design n\xE0y \u0111\xE3 l\u01B0u kho (archived)** \u2014 kh\xF4ng c\xF2n l\xE0 h\u01B0\u1EDBng \u0111ang d\xF9ng, d\xF9 ch\u01B0a b\u1ECB design n\xE0o kh\xE1c thay th\u1EBF th\u1EB3ng. Task khai \`implements\` m\u1ED9t design \u0111\xE3 l\u01B0u kho th\xEC nhi\u1EC1u kh\u1EA3 n\u0103ng b\u1EA3n th\xE2n task c\u0169ng l\u1ED7i th\u1EDDi \u2014 x\xE1c nh\u1EADn l\u1EA1i tr\u01B0\u1EDBc khi l\xE0m, \u0111\u1EEBng m\u1EB7c \u0111\u1ECBnh n\xF3 c\xF2n \u0111\xFAng.`;
    }
    parts.push(`## Design \u0111ang hi\u1EC7n th\u1EF1c

### ${d.id} \u2014 ${d.title}

${d.summary}${warning}`);
  }
  const decisionIds = new Set(design?.value.decisions ?? []);
  for (const sourced2 of graph.decisions.values()) {
    const d = sourced2.value;
    if (d.scope === void 0 || d.scope === t.scope) decisionIds.add(d.id);
  }
  const superseded = /* @__PURE__ */ new Set();
  for (const sourced2 of graph.decisions.values()) {
    for (const oldId of sourced2.value.supersedes) superseded.add(oldId);
  }
  const decisions = [...decisionIds].filter((id) => !superseded.has(id)).sort((a, b) => a.localeCompare(b)).map((id) => graph.decisions.get(id)?.value).filter((d) => Boolean(d)).map((d) => {
    const detail = [];
    if (d.context) detail.push(`  v\xEC: ${d.context}`);
    if (d.consequence) detail.push(`  \u0111\xE1nh \u0111\u1ED5i: ${d.consequence}`);
    if (d.link) detail.push(`  ngu\u1ED3n: ${d.link}`);
    return `\`${d.id}\` \u2014 ${d.statement} *(${d.decided_by}, ${d.decided_at.slice(0, 10)}${d.scope === void 0 ? ", to\xE0n d\u1EF1 \xE1n" : ""})*` + (detail.length ? `
${detail.join("\n")}` : "");
  });
  if (decisions.length > 0) {
    parts.push(
      `## Quy\u1EBFt \u0111\u1ECBnh \u0111\xE3 ch\u1ED1t \u2014 kh\xF4ng \u0111\u01B0\u1EE3c \u0111i ng\u01B0\u1EE3c

Ng\u01B0\u1EDDi \u0111\xE3 quy\u1EBFt. Model kh\xF4ng \u0111\u01B0\u1EE3c t\u1EA1o, kh\xF4ng \u0111\u01B0\u1EE3c s\u1EEDa \u2014 ch\u1EC9 tu\xE2n theo, ho\u1EB7c n\xEAu m\xE2u thu\u1EABn \u0111\u1EC3 ng\u01B0\u1EDDi x\u1EED l\xFD.

` + bullet(decisions)
    );
  }
  if (t.context_contract.must_read.length > 0) {
    const items = t.context_contract.must_read.map((m) => {
      const missing = !existsSync9(join10(graph.root, m.path));
      return `\`${m.path}\`${missing ? " \u2014 \u26A0 **KH\xD4NG T\u1ED2N T\u1EA0I**" : ""}
  ${m.why}`;
    });
    parts.push(`## Ph\u1EA3i \u0111\u1ECDc tr\u01B0\u1EDBc khi s\u1EEDa g\xEC

${bullet(items)}`);
  }
  if (t.touches.length > 0) {
    const items = t.touches.map((moduleId) => {
      const mod = graph.modules.get(moduleId)?.value;
      if (!mod) return `\`${moduleId}\` \u2014 \u26A0 **KH\xD4NG T\xCCM TH\u1EA4Y** trong s\u01A1 \u0111\u1ED3 kh\u1ED1i`;
      const locations = [...mod.paths, ...mod.entrypoints];
      return `\`${moduleId}\` \u2014 ${mod.title}` + (locations.length ? `
  ${locations.map((p) => `\`${p}\``).join(", ")}` : "\n  (ch\u01B0a khai paths/entrypoints)");
    });
    parts.push(`## Kh\u1ED1i ch\u1EA1m t\u1EDBi (suy t\u1EEB s\u01A1 \u0111\u1ED3)

${bullet(items)}`);
  }
  const usable = [];
  const needsRecheck = [];
  const outOfScope = [];
  for (const factId of t.context_contract.facts) {
    const info = freshness.get(factId);
    if (!info) {
      needsRecheck.push(`\`${factId}\` \u2014 \u26A0 **KH\xD4NG T\xCCM TH\u1EA4Y** trong kho tri th\u1EE9c`);
      continue;
    }
    const f = info.fact;
    if (!f) continue;
    const anchors = f.anchors.length ? `  ngu\u1ED3n: ${f.anchors.map(formatAnchor).join(", ")}
` : "";
    if (f.scope !== t.scope) {
      outOfScope.push(
        `\`${f.id}\` \u2014 ${f.statement}
${anchors}  L\xDD DO: ph\u1EA1m vi \`${f.scope}\` \u2260 \`${t.scope}\` \u2014 ch\u01B0a ch\u1EAFc \u0111\xFAng \u1EDF \u0111\xE2y` + (info.freshness === "fresh" ? "" : ` (v\xE0: ${info.reason})`) + `
  ki\u1EC3m l\u1EA1i trong ph\u1EA1m vi n\xE0y r\u1ED3i h\xE3y d\u1EF1a v\xE0o: \`ganas verify ${f.id}\``
      );
      continue;
    }
    if (info.freshness === "fresh") {
      usable.push(`\`${f.id}\` \u2014 ${f.statement}
${anchors}  ${info.reason}`);
      continue;
    }
    const trend = info.recentScores && info.recentScores.length > 1 ? `
  \u0111i\u1EC3m c\xE1c l\u1EA7n g\u1EA7n \u0111\xE2y: ${info.recentScores.map((s) => s.toFixed(2)).join(" \u2192 ")}` : "";
    needsRecheck.push(
      `\`${f.id}\` \u2014 ${f.statement}
${anchors}  L\xDD DO: ${info.reason}${trend}
  ${info.action ?? `ch\u1EA1y: \`ganas verify ${f.id}\``}`
    );
  }
  if (usable.length > 0) {
    parts.push(`## Tri th\u1EE9c d\xF9ng \u0111\u01B0\u1EE3c (\u0111\xE3 ki\u1EC3m ch\u1EE9ng, c\xF2n t\u01B0\u01A1i)

${bullet(usable)}`);
  }
  if (needsRecheck.length > 0) {
    parts.push(
      `## \u26A0 C\u1EA6N VERIFY L\u1EA0I TR\u01AF\u1EDAC KHI D\xD9NG

Nh\u1EEFng \u0111i\u1EC1u d\u01B0\u1EDBi \u0111\xE2y **kh\xF4ng** \u0111\u01B0\u1EE3c coi l\xE0 s\u1EF1 th\u1EADt cho t\u1EDBi khi ch\u1EA1y l\u1EA1i probe.
N\u1EBFu c\xF4ng vi\u1EC7c ph\u1EE5 thu\u1ED9c v\xE0o ch\xFAng, verify tr\u01B0\u1EDBc r\u1ED3i h\xE3y s\u1EEDa code.

` + bullet(needsRecheck)
    );
  }
  if (outOfScope.length > 0) {
    parts.push(
      `## \u26A0 NGO\xC0I PH\u1EA0M VI \u2014 CH\u01AFA CH\u1EAEC \u0110\xDANG \u1EDE \u0110\xC2Y

Nh\u1EEFng \u0111i\u1EC1u d\u01B0\u1EDBi \u0111\xE2y \u0111\xE3 \u0111\u01B0\u1EE3c ki\u1EC3m ch\u1EE9ng, nh\u01B0ng **trong m\u1ED9t ph\u1EA1m vi kh\xE1c**.
Ch\xFAng kh\xF4ng sai \u2014 ch\u1EC9 l\xE0 ch\u01B0a ai ki\u1EC3m r\u1EB1ng ch\xFAng c\xF2n \u0111\xFAng trong \`${t.scope}\`.
\u0110\u1EEBng d\u1EF1a v\xE0o ch\xFAng nh\u01B0 s\u1EF1 th\u1EADt \u1EDF \u0111\xE2y; mu\u1ED1n d\xF9ng th\xEC ki\u1EC3m l\u1EA1i trong ph\u1EA1m vi n\xE0y.

` + bullet(outOfScope)
    );
  }
  const suggested = suggestedFactsSection(graph, freshness, t);
  if (suggested) parts.push(suggested);
  const legacy = relevantLegacyClaims(graph, t);
  const totalUnverifiedLegacy = [...graph.claims.values()].filter(
    (c) => c.value.provenance === "imported" && c.value.trust === "unverified"
  ).length;
  const otherLegacy = totalUnverifiedLegacy - legacy.length;
  if (legacy.length > 0 || otherLegacy > 0) {
    const items = legacy.map(
      (c) => `\`${c.id}\` \u2014 ${c.statement}
  t\xE0i li\u1EC7u c\u0169 n\xF3i v\u1EADy: ${c.anchors.map(formatAnchor).join(", ")}`
    );
    const rest = otherLegacy > 0 ? `

C\xF2n ${otherLegacy} ph\xE1t bi\u1EC3u k\u1EBF th\u1EEBa kh\xE1c ch\u01B0a \u0111\u01B0\u1EE3c \u0111\u1ED1i ch\u1EA5t, kh\xF4ng li\xEAn quan tr\u1EF1c ti\u1EBFp t\u1EDBi task n\xE0y (xem \`.ganas/claims/\` v\xE0 \`.ganas/legacy/imported/\`).` : "";
    parts.push(
      `## \u26A0 TRI TH\u1EE8C K\u1EBE TH\u1EEAA \u2014 CH\u01AFA KI\u1EC2M CH\u1EE8NG

\u0110\xE2y l\xE0 \u0111i\u1EC1u **t\xE0i li\u1EC7u c\u0169** n\xF3i. Ch\u01B0a ai \u0111\u1ED1i ch\u1EA5t v\u1EDBi code th\u1EADt. C\xF3 th\u1EC3 \u0111\xFAng, c\xF3 th\u1EC3 l\xE0 hi\u1EC3u nh\u1EA7m \u0111\xE3 t\u1ED3n t\u1EA1i l\xE2u.
D\xF9ng th\xEC ph\u1EA3i ki\u1EC3m tr\u01B0\u1EDBc, v\xE0 ghi l\u1EA1i k\u1EBFt qu\u1EA3 ki\u1EC3m.` + (items.length ? `

${bullet(items)}` : "") + rest
    );
  }
  if (t.context_contract.open_questions.length > 0) {
    parts.push(
      `## C\xE2u h\u1ECFi c\xF2n m\u1EDF

Ch\u01B0a ai tr\u1EA3 l\u1EDDi. **\u0110\u1EEBng t\u1EF1 quy\u1EBFt** \u2014 h\u1ECFi l\u1EA1i, ho\u1EB7c ghi gi\u1EA3 \u0111\u1ECBnh v\xE0o handoff.

` + bullet(t.context_contract.open_questions)
    );
  }
  const skillSet = new Set(t.skills);
  for (const moduleId of t.touches) {
    const mod = graph.modules.get(moduleId)?.value;
    if (!mod) continue;
    for (const s of mod.skills) skillSet.add(s);
  }
  if (skillSet.size > 0) {
    parts.push(
      `## K\u1EF9 n\u0103ng c\u1EA7n d\xF9ng cho task n\xE0y

${bullet([...skillSet].map((s) => `\`/${s}\``))}`
    );
  }
  parts.push(dispatchSection(graph, t));
  const auto = [];
  const manual = [];
  for (const c of t.exit_contract) {
    switch (c.kind) {
      case "command":
        auto.push(`l\u1EC7nh \`${c.run}\``);
        break;
      case "artifact":
        auto.push(
          `file \`${c.path}\`` + (c.must_contain ? ` ph\u1EA3i ch\u1EE9a \`${c.must_contain}\`` : " ph\u1EA3i t\u1ED3n t\u1EA1i")
        );
        break;
      case "handoff":
        if (c.required) auto.push(`handoff record c\u1EE7a phi\xEAn n\xE0y`);
        break;
      case "manual":
        manual.push(c.check);
        break;
      case "verification": {
        const info = freshness.get(c.target);
        const state = info ? `${info.freshness} \u2014 ${info.reason}` : void 0;
        auto.push(`b\u1EB1ng ch\u1EE9ng \`${c.target}\`` + (state ? ` \u2014 ${state}` : ""));
        break;
      }
      default:
        c;
    }
  }
  const mode = enforcementFor(graph.config, "exit_contract");
  const gateNote = mode === "enforce" ? `Stop hook s\u1EBD ch\u1EA5m nh\u1EEFng m\u1EE5c d\u01B0\u1EDBi \u0111\xE2y. **Ch\u01B0a tho\u1EA3 th\xEC phi\xEAn kh\xF4ng k\u1EBFt th\xFAc \u0111\u01B0\u1EE3c.**` : `Stop hook s\u1EBD ch\u1EA5m nh\u1EEFng m\u1EE5c d\u01B0\u1EDBi \u0111\xE2y v\xE0 c\u1EA3nh b\xE1o n\u1EBFu ch\u01B0a tho\u1EA3 (ch\u1EBF \u0111\u1ED9 warn \u2014 ch\u01B0a ch\u1EB7n).`;
  parts.push(
    `## \u0110i\u1EC1u ki\u1EC7n ho\xE0n th\xE0nh

${gateNote}

` + bullet(auto.map((a) => `[ ] ${a}`)) + (manual.length ? `

C\u1EA7n ng\u01B0\u1EDDi x\xE1c nh\u1EADn (kh\xF4ng ch\u1EB7n phi\xEAn, nh\u01B0ng ch\u1EB7n vi\u1EC7c \u0111\xE1nh d\u1EA5u task done):
` + bullet(manual) : "")
  );
  const icebox = overdueIceboxSection(graph, t, now);
  if (icebox) parts.push(icebox);
  parts.push(RULE_REMINDER);
  const stable = parts.join("\n\n");
  if (stable.length > BRIEF_LENGTH_WARNING_CHARS) {
    const approxLines = stable.split("\n").length;
    parts.splice(
      1,
      0,
      `> \u26A0 Brief n\xE0y d\xE0i ~${stable.length} k\xFD t\u1EF1 (~${approxLines} d\xF2ng) \u2014 c\xE2n nh\u1EAFc ch\u1EBB nh\u1ECF task/design, ho\u1EB7c
> g\u1ECDn b\u1EDBt \`context_contract.must_read\`.`
    );
  }
  if (input.volatile) {
    parts.push(`---

${input.volatile}`);
  }
  return parts.join("\n\n");
}
var RULE_REMINDER, BRIEF_LENGTH_WARNING_CHARS, SUGGESTED_FACTS_LIMIT, ICEBOX_OVERDUE_LIMIT, DAY_MS;
var init_brief = __esm({
  "src/render/brief.ts"() {
    "use strict";
    init_freshness();
    init_select();
    init_model();
    init_search();
    init_group();
    RULE_REMINDER = `## Lu\u1EADt ghi tri th\u1EE9c

Ghi v\xE0o \`.ganas/\` th\xEC ph\u1EA3i k\xE8m b\u1EB1ng ch\u1EE9ng: anchor \`file:line\`, \`commit:sha\`,
ho\u1EB7c URL k\xE8m \`fetched_at\`. Kh\xF4ng c\xF3 b\u1EB1ng ch\u1EE9ng th\xEC kh\xF4ng ghi \u2014 n\xF3i th\u1EB3ng l\xE0
ch\u01B0a bi\u1EBFt v\xE0 \u0111\u01B0a v\xE0o \`open_questions\`.

Kh\xF4ng n\xE2ng claim th\xE0nh fact n\u1EBFu ch\u01B0a ch\u1EA1y probe. Kh\xF4ng s\u1EEDa \`last_verified_at\`
b\u1EB1ng tay.`;
    BRIEF_LENGTH_WARNING_CHARS = 14e3;
    SUGGESTED_FACTS_LIMIT = 3;
    ICEBOX_OVERDUE_LIMIT = 3;
    DAY_MS = 24 * 60 * 60 * 1e3;
  }
});

// src/commands/brief.ts
var brief_exports = {};
__export(brief_exports, {
  run: () => run6
});
async function run6(argv) {
  const { root, graph, freshness } = await openProject(argv);
  const sessionId = option(argv, "session");
  const taskId = argv.positional[0] ?? option(argv, "task") ?? await taskForSession(root, sessionId);
  if (!taskId) {
    throw new GanasError(
      `ch\u01B0a bi\u1EBFt \u0111ang l\xE0m task n\xE0o.
  Ch\u1ECDn task k\u1EBF ti\u1EBFp: ganas next
  Ho\u1EB7c ch\u1EC9 \u0111\u1ECBnh:      ganas brief T-001`
    );
  }
  const task = graph.tasks.get(taskId);
  if (!task) {
    throw new GanasError(
      `kh\xF4ng c\xF3 task ${taskId}.
  Task hi\u1EC7n c\xF3: ${[...graph.tasks.keys()].sort().join(", ") || "(ch\u01B0a c\xF3 task n\xE0o)"}`
    );
  }
  const volatile = argv.flags["volatile"] === false ? void 0 : await volatileStatus(root);
  const text = renderBrief({ graph, task, freshness, volatile });
  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ task: taskId, brief: text }, null, 2) + "\n");
    return 0;
  }
  process.stdout.write(text + "\n");
  return 0;
}
var init_brief2 = __esm({
  "src/commands/brief.ts"() {
    "use strict";
    init_brief();
    init_state();
    init_args();
    init_errors();
    init_common2();
  }
});

// src/commands/next.ts
var next_exports = {};
__export(next_exports, {
  run: () => run7
});
async function run7(argv) {
  const { root, graph, freshness } = await openProject(argv);
  const ranked = rankedCandidates(graph);
  if (ranked.length === 0) {
    const blocked = blockedTasks(graph);
    if (flag(argv, "json")) {
      process.stdout.write(
        JSON.stringify(
          {
            task: null,
            blocked: blocked.map((c) => ({ id: c.task.value.id, blockers: c.blockers }))
          },
          null,
          2
        ) + "\n"
      );
      return 0;
    }
    if (blocked.length === 0) {
      const empty = graph.tasks.size === 0;
      process.stdout.write(
        (empty ? `D\u1EF1 \xE1n ch\u01B0a c\xF3 task n\xE0o.

` : `Kh\xF4ng c\xF2n task n\xE0o ch\u01B0a xong.

`) + (empty && graph.scopes.size === 0 ? `Tr\u01B0\u1EDBc h\u1EBFt c\u1EA7n m\u1ED9t ph\u1EA1m vi c\xF4ng vi\u1EC7c \u2014 task ph\u1EA3i thu\u1ED9c v\u1EC1 m\u1ED9t c\xE1i:
  ganas scope new

` : "") + `Th\xEAm task m\u1EDBi v\xE0o .ganas/tasks/ (nh\u1EDB khai serves, implements, scope, exit_contract),
r\u1ED3i ch\u1EA1y: ganas validate
`
      );
      return 0;
    }
    process.stdout.write(
      `M\u1ECDi task c\xF2n l\u1EA1i \u0111\u1EC1u \u0111ang b\u1ECB ch\u1EB7n:

` + renderGroupedByScope(
        graph,
        blocked,
        (c) => c.task.value,
        (c) => `${c.task.value.id} \u2014 ${c.task.value.title}
  ch\u1EDD: ${c.blockers.join(", ")}`
      )
    );
    return 0;
  }
  const sessionId = option(argv, "session");
  const picked = await claimNextTask(graph, root, sessionId ?? "cli");
  if (!picked) {
    if (flag(argv, "json")) {
      process.stdout.write(
        JSON.stringify({ task: null, held_by_others: ranked.length }, null, 2) + "\n"
      );
      return 0;
    }
    process.stdout.write(
      `${ranked.length} task c\xF2n l\xE0m \u0111\u01B0\u1EE3c, nh\u01B0ng t\u1EA5t c\u1EA3 \u0111ang b\u1ECB phi\xEAn kh\xE1c gi\u1EEF:

` + renderGroupedByScope(
        graph,
        ranked,
        (c) => c.task.value,
        (c) => `${c.task.value.id} \u2014 ${c.task.value.title}`
      ) + `
Th\u1EED l\u1EA1i sau, ho\u1EB7c ch\u1EDD phi\xEAn \u0111ang gi\u1EEF gi\u1EA3i ph\xF3ng.
`
    );
    return 0;
  }
  const taskId = picked.task.value.id;
  if (sessionId) await bindSession(root, sessionId, taskId);
  else await updateState(root, (s) => void (s.current_task = taskId));
  const baselineGreen = sessionId ? await recordBaseline(root, graph, picked.task.value, freshness, argv) : [];
  if (flag(argv, "json")) {
    const brief = renderBrief({ graph, task: picked.task, freshness });
    process.stdout.write(JSON.stringify({ task: taskId, brief }, null, 2) + "\n");
    return 0;
  }
  const volatile = argv.flags["volatile"] === false ? void 0 : await volatileStatus(root);
  process.stdout.write(renderBrief({ graph, task: picked.task, freshness, volatile }) + "\n");
  if (baselineGreen.length > 0) {
    process.stdout.write(
      `
\u26A0 ${baselineGreen.length} ti\xEAu ch\xED trong \`exit_contract\` c\u1EE7a ${taskId} \u0110\xC3 \u0110\u1EA0T ngay l\xFAc n\xE0y, tr\u01B0\u1EDBc khi l\xE0m g\xEC:
` + baselineGreen.map((l) => `    ${l}`).join("\n") + `

  Ho\u1EB7c task n\xE0y \u0111\xE3 xong t\u1EEB tr\u01B0\u1EDBc, ho\u1EB7c nh\u1EEFng ti\xEAu ch\xED \u0111\xF3 kh\xF4ng g\xE1c g\xEC \u2014
  ch\xFAng s\u1EBD v\u1EABn xanh d\xF9 kh\xF4ng vi\u1EBFt d\xF2ng n\xE0o. S\u1EEDa \`exit_contract\` \u0111\u1EC3 n\xF3 \u0111\xF2i
  \u0111\xFAng th\u1EE9 task n\xE0y ph\u1EA3i t\u1EA1o ra, tr\u01B0\u1EDBc khi b\u1EAFt \u0111\u1EA7u.
`
    );
  }
  return 0;
}
async function recordBaseline(root, graph, task, freshness, argv) {
  if (!enabled(argv, "baseline")) return [];
  const sessionId = option(argv, "session");
  const auto = task.exit_contract.filter(isAutoCriterion);
  if (auto.length === 0) return [];
  const gate = await evaluateGate(
    graph,
    { ...task, exit_contract: auto },
    freshness
  );
  const baseline = {};
  for (const r of gate.results) baseline[criterionKey(r.criterion)] = r.status === "pass";
  await setBaseline(root, sessionId, baseline);
  return gate.results.filter((r) => r.status === "pass").map((r) => r.label);
}
var init_next = __esm({
  "src/commands/next.ts"() {
    "use strict";
    init_gate();
    init_claim();
    init_select();
    init_brief();
    init_group();
    init_state();
    init_args();
    init_common2();
  }
});

// src/commands/gate.ts
var gate_exports = {};
__export(gate_exports, {
  run: () => run8
});
async function run8(argv) {
  const { root, graph, freshness } = await openProject(argv);
  const sessionId = option(argv, "session");
  const taskId = argv.positional[0] ?? option(argv, "task") ?? await taskForSession(root, sessionId);
  if (!taskId) throw new GanasError("ch\u01B0a bi\u1EBFt \u0111ang l\xE0m task n\xE0o \u2014 ch\u1EA1y `ganas next` tr\u01B0\u1EDBc");
  const task = graph.tasks.get(taskId);
  if (!task) throw new GanasError(`kh\xF4ng c\xF3 task ${taskId}`);
  const result = await evaluateGate(graph, task.value, freshness, sessionId);
  const green = alreadyGreen(result, await baselineFor(root, sessionId, taskId));
  const touched = await touchedPathsFor(root, sessionId, taskId);
  const boundary = taskBoundary(task.value, graph);
  const outside = outsideBoundary(task.value, graph, touched);
  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          task: result.task,
          ok: result.ok,
          unmet: result.unmet.map((u) => ({ label: u.label, reason: u.reason })),
          pending_human: result.pendingHuman.map((p) => p.label),
          already_green_at_start: green.map((g) => g.label),
          outside_boundary: outside
        },
        null,
        2
      ) + "\n"
    );
    return result.ok ? 0 : 1;
  }
  process.stdout.write(`\u0110i\u1EC1u ki\u1EC7n ho\xE0n th\xE0nh c\u1EE7a ${result.task}:
${formatGate(result)}

`);
  if (green.length > 0) {
    process.stdout.write(
      `\u26A0 ${green.length} ti\xEAu ch\xED \u0111\xE3 XANH S\u1EB4N t\u1EEB tr\u01B0\u1EDBc khi b\u1EAFt \u0111\u1EA7u task:
` + green.map((g) => `    ${g.label}`).join("\n") + `
  Ho\u1EB7c task n\xE0y \u0111\xE3 xong t\u1EEB tr\u01B0\u1EDBc, ho\u1EB7c ti\xEAu ch\xED \u0111\xF3 kh\xF4ng g\xE1c g\xEC.
  M\u1ED9t gate t\u1EF1 xanh tr\u01B0\u1EDBc khi s\u1EEDa l\xE0 gate kh\xF4ng t\u1ED3n t\u1EA1i.

`
    );
  }
  const boundaryWarning = formatBoundaryWarning(taskId, boundary, touched, outside);
  if (boundaryWarning) process.stdout.write(`${boundaryWarning}
`);
  const subagentTouched = await subagentTouchedFor(root, sessionId, taskId);
  const dispatchWarning = formatDispatchWarning(taskId, task.value.model, subagentTouched);
  if (dispatchWarning) process.stdout.write(`${dispatchWarning}
`);
  if (result.ok) {
    process.stdout.write(`\u2713 M\u1ECDi ti\xEAu ch\xED ch\u1EA5m t\u1EF1 \u0111\u1ED9ng \u0111\u1EC1u \u0111\u1EA1t.
`);
    if (result.pendingHuman.length > 0) {
      process.stdout.write(
        `
C\xF2n ${result.pendingHuman.length} ti\xEAu ch\xED c\u1EA7n ng\u01B0\u1EDDi x\xE1c nh\u1EADn tr\u01B0\u1EDBc khi \u0111\xE1nh d\u1EA5u task done:
` + result.pendingHuman.map((p) => `  \u2026 ${p.label}`).join("\n") + "\n"
      );
    }
    return 0;
  }
  process.stdout.write(`\u2717 C\xF2n ${result.unmet.length} ti\xEAu ch\xED ch\u01B0a \u0111\u1EA1t.
`);
  return 1;
}
var init_gate2 = __esm({
  "src/commands/gate.ts"() {
    "use strict";
    init_boundary();
    init_gate();
    init_state();
    init_args();
    init_errors();
    init_common2();
  }
});

// src/commands/verify.ts
var verify_exports = {};
__export(verify_exports, {
  needsRunFor: () => needsRunFor,
  run: () => run9
});
function needsRunFor(target, graph, freshness) {
  const state = freshness.get(target.id);
  if (state && state.freshness !== "fresh") return state.reason;
  const last = lastFor(graph.ledger, target.id);
  if (!last) return "ch\u01B0a ch\u1EA1y l\u1EA7n n\xE0o";
  if (target.kind === "probe" && last.proof === void 0) {
    return "l\u1EA7n tr\u01B0\u1EDBc b\u1ECF qua mutation test \u2014 ch\u01B0a ch\u1EE9ng minh \u0111\u01B0\u1EE3c probe c\xF3 th\u1EC3 fail";
  }
  const ttl = target.ttlDays;
  if (ttl > 0 && Date.now() - Date.parse(last.at) > ttl * 864e5) {
    return `qu\xE1 h\u1EA1n ${ttl} ng\xE0y`;
  }
  return null;
}
function tierOf(target) {
  return target.definition.tier ?? "smoke";
}
function estimateCost(target, graph) {
  for (const e of [...graph.ledger.get(target.id) ?? []].reverse()) {
    if (e.cost_usd !== void 0) return e.cost_usd;
  }
  return void 0;
}
function matches(target, wanted) {
  return target.id === wanted || target.id.startsWith(`${wanted}/`);
}
async function run9(argv) {
  const { root, graph, freshness } = await openProject(argv);
  const wanted = argv.positional;
  const tier = option(argv, "tier") ?? "smoke";
  const dryRun = flag(argv, "dry-run");
  const skipMutation = argv.flags["mutation"] === false;
  const maxCost = option(argv, "max-cost-usd");
  const budget = maxCost === void 0 ? Infinity : Number(maxCost);
  if (Number.isNaN(budget)) throw new GanasError(`--max-cost-usd kh\xF4ng ph\u1EA3i s\u1ED1: ${maxCost}`);
  const scopeFilter = option(argv, "scope");
  if (scopeFilter !== void 0 && !graph.scopes.has(scopeFilter)) {
    throw new GanasError(`kh\xF4ng c\xF3 ph\u1EA1m vi n\xE0o t\xEAn "${scopeFilter}" \u2014 xem \`ganas validate\``);
  }
  const all = allTargets(graph).filter(
    (t) => scopeFilter === void 0 || scopeOfTarget(t, graph) === scopeFilter
  );
  if (all.length === 0) {
    process.stdout.write(
      scopeFilter !== void 0 ? `Ph\u1EA1m vi ${scopeFilter} ch\u01B0a c\xF3 b\u1EB1ng ch\u1EE9ng n\xE0o \u0111\u1EC3 verify.
` : `Ch\u01B0a c\xF3 g\xEC \u0111\u1EC3 verify.

Th\xEAm \`verify:\` v\xE0o kh\u1ED1i trong .ganas/modules/, ho\u1EB7c fact trong .ganas/facts/.
`
    );
    return 0;
  }
  let selected;
  if (wanted.length > 0) {
    selected = [];
    for (const w of wanted) {
      const hits = all.filter((t) => matches(t, w));
      if (hits.length === 0) throw new GanasError(`kh\xF4ng c\xF3 target n\xE0o kh\u1EDBp "${w}"`);
      for (const target of hits) selected.push({ target, why: "\u0111\u01B0\u1EE3c ch\u1EC9 \u0111\u1ECBnh" });
    }
  } else {
    const wantAll = flag(argv, "all");
    selected = all.filter(
      (t) => tier === "all" || tierOf(t) === tier || tier === "full" && tierOf(t) === "smoke"
    ).map((target) => ({ target, why: needsRunFor(target, graph, freshness) ?? "" })).filter((s) => wantAll || s.why !== "").map((s) => ({ target: s.target, why: s.why || "ch\u1EA1y l\u1EA1i theo y\xEAu c\u1EA7u" }));
  }
  if (selected.length === 0) {
    process.stdout.write(
      `Kh\xF4ng c\xF3 g\xEC c\u1EA7n ch\u1EA1y \u2014 m\u1ECDi b\u1EB1ng ch\u1EE9ng tier "${tier}" \u0111\u1EC1u c\xF2n t\u01B0\u01A1i.
  Ch\u1EA1y l\u1EA1i t\u1EA5t c\u1EA3: ganas verify --all
  G\u1ED3m c\u1EA3 tier full: ganas verify --tier full
`
    );
    return 0;
  }
  const by = option(argv, "session") ? `session:${option(argv, "session")}` : "cli";
  const outcomes = [];
  let spent = 0;
  let stoppedForBudget = null;
  const unknownCost = [];
  for (const { target, why } of selected) {
    const estimate = estimateCost(target, graph);
    if (spent + (estimate ?? 0) > budget) {
      stoppedForBudget = target.label;
      break;
    }
    if (budget < Infinity && estimate === void 0 && target.kind === "eval") {
      unknownCost.push(target.label);
    }
    const outcome = await runTarget(target, { root, by, skipMutation, dryRun });
    outcomes.push(outcome);
    spent += outcome.costUsd ?? 0;
    if (!flag(argv, "json")) {
      const mark = dryRun ? "\u2192" : MARK[outcome.result];
      const label = dryRun ? "s\u1EBD ch\u1EA1y" : LABEL2[outcome.result];
      const est = estimateCost(target, graph);
      const detail = dryRun ? why + (est !== void 0 ? ` \xB7 \u01B0\u1EDBc t\xEDnh $${est.toFixed(4)}` : "") : outcome.reason ?? "";
      process.stdout.write(
        `${mark} ${target.label.padEnd(28)} ${label}` + (detail ? `
    ${detail.split("\n").join("\n    ")}` : "") + "\n"
      );
    }
  }
  const count = (r) => outcomes.filter((o) => o.result === r).length;
  const failed = count("fail") + count("marginal");
  const broken = outcomes.filter((o) => o.result === "unprovable" && !dryRun).length;
  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          ran: outcomes.length,
          cost_usd: spent,
          stopped_for_budget: stoppedForBudget,
          results: outcomes.map((o) => ({
            target: o.target.id,
            result: o.result,
            score: o.score,
            proof: o.proof,
            reason: o.reason
          }))
        },
        null,
        2
      ) + "\n"
    );
    return failed > 0 || broken > 0 ? 1 : 0;
  }
  const parts = [
    `${outcomes.length} target`,
    count("pass") ? `${count("pass")} \u0111\u1EA1t` : "",
    count("fail") ? `${count("fail")} tr\u01B0\u1EE3t` : "",
    count("marginal") ? `${count("marginal")} s\xE1t ng\u01B0\u1EE1ng` : "",
    count("unavailable") ? `${count("unavailable")} kh\xF4ng ki\u1EC3m \u0111\u01B0\u1EE3c` : "",
    broken ? `${broken} ch\u01B0a ch\u1EE9ng minh \u0111\u01B0\u1EE3c` : ""
  ].filter(Boolean);
  process.stdout.write(`
${parts.join(" \xB7 ")}
`);
  if (spent > 0) process.stdout.write(`chi ph\xED: $${spent.toFixed(4)}
`);
  if (stoppedForBudget) {
    process.stdout.write(
      `
\u26A0 D\u1EEBng tr\u01B0\u1EDBc "${stoppedForBudget}" v\xEC \u0111\xE3 ch\u1EA1m h\u1EA1n m\u1EE9c $${budget}. C\xF2n ${selected.length - outcomes.length} target ch\u01B0a ch\u1EA1y.
`
    );
  }
  if (unknownCost.length > 0) {
    process.stdout.write(
      `
\u26A0 Ch\u01B0a c\xF3 l\u1ECBch s\u1EED chi ph\xED cho: ${unknownCost.join(", ")}.
  H\u1EA1n m\u1EE9c kh\xF4ng ch\u1EB7n \u0111\u01B0\u1EE3c l\u1EA7n ch\u1EA1y \u0111\u1EA7u c\u1EE7a ch\xFAng \u2014 l\u1EA7n sau s\u1EBD \u01B0\u1EDBc t\xEDnh \u0111\u01B0\u1EE3c.
`
    );
  }
  const unproven = outcomes.filter((o) => o.proof === "unproven").length;
  if (unproven > 0 && !dryRun) {
    process.stdout.write(
      `
${unproven} probe ch\u01B0a ch\u1EE9ng minh \u0111\u01B0\u1EE3c l\xE0 c\xF3 th\u1EC3 fail (ganas kh\xF4ng nh\u1EADn ra d\u1EA1ng \u0111\u1EC3 b\xF3p m\xE9o).
Ch\xFAng v\u1EABn \u0111\u01B0\u1EE3c t\xEDnh l\xE0 \u0111\u1EA1t, nh\u01B0ng "\u0111\u1EA1t" \u1EDF \u0111\xE2y y\u1EBFu h\u01A1n ph\u1EA7n c\xF2n l\u1EA1i.
`
    );
  }
  return failed > 0 || broken > 0 ? 1 : 0;
}
var MARK, LABEL2;
var init_verify = __esm({
  "src/commands/verify.ts"() {
    "use strict";
    init_args();
    init_errors();
    init_ledger();
    init_run();
    init_common2();
    MARK = {
      pass: "\u2713",
      fail: "\u2717",
      marginal: "\u2248",
      unavailable: "\u2026",
      unprovable: "\u26A0"
    };
    LABEL2 = {
      pass: "\u0111\u1EA1t",
      fail: "TR\u01AF\u1EE2T",
      marginal: "s\xE1t ng\u01B0\u1EE1ng",
      unavailable: "kh\xF4ng ki\u1EC3m \u0111\u01B0\u1EE3c \u1EDF \u0111\xE2y",
      unprovable: "ch\u01B0a ch\u1EE9ng minh \u0111\u01B0\u1EE3c"
    };
  }
});

// src/commands/trace.ts
var trace_exports = {};
__export(trace_exports, {
  run: () => run10
});
function edgeLine(check) {
  const { edge } = check;
  const head = `${MARK2[check.result]} ${edge.from}/${edge.verificationId} \u2192 ${edge.to}`;
  return check.reason ? `${head}
    ${check.reason}` : head;
}
async function run10(argv) {
  const { root, graph } = await openProject(argv);
  const scopeFilter = option(argv, "scope");
  if (scopeFilter !== void 0 && !graph.scopes.has(scopeFilter)) {
    throw new GanasError(`kh\xF4ng c\xF3 ph\u1EA1m vi n\xE0o t\xEAn "${scopeFilter}" \u2014 xem \`ganas validate\``);
  }
  const inScope = (moduleId) => scopeFilter === void 0 || graph.modules.get(moduleId)?.value.scope === scopeFilter;
  const checks = (await checkAllEdges(graph, root)).filter(
    (c) => inScope(c.edge.from) && inScope(c.edge.to)
  );
  const dryRun = flag(argv, "dry-run");
  if (!dryRun) {
    const by = option(argv, "session") ? `session:${option(argv, "session")}` : "cli";
    await recordEdgeChecks(graph, checks, { root, by });
  }
  const debt = computeDebt(graph, checks).filter(
    (d) => scopeFilter === void 0 || (d.moduleId !== void 0 ? inScope(d.moduleId) : true) && (d.edge === void 0 || inScope(d.edge.from) && inScope(d.edge.to))
  );
  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          edges: checks.map((c) => ({
            from: c.edge.from,
            to: c.edge.to,
            verification: c.edge.verificationId,
            result: c.result,
            reason: c.reason
          })),
          debt
        },
        null,
        2
      ) + "\n"
    );
    return debt.length > 0 || checks.some((c) => c.result === "fail") ? 1 : 0;
  }
  if (checks.length === 0) {
    process.stdout.write(
      `Ch\u01B0a c\xF3 c\u1EA1nh contract n\xE0o. Th\xEAm \`kind: contract\` v\xE0o \`verify\` c\u1EE7a kh\u1ED1i \u0111\u1EC3 ki\u1EC3m t\u01B0\u01A1ng th\xEDch c\u1ED5ng.

`
    );
  } else {
    for (const c of checks) process.stdout.write(edgeLine(c) + "\n");
    process.stdout.write("\n");
  }
  if (argv.flags["diagram"] !== false) {
    const edgeResults = new Map(
      checks.map((c) => [`${c.edge.from}/${c.edge.verificationId}`, c.result])
    );
    process.stdout.write("```mermaid\n" + renderDiagram(graph, { edgeResults }) + "\n```\n\n");
  }
  if (debt.length === 0) {
    process.stdout.write("Kh\xF4ng c\xF3 n\u1EE3 ki\u1EC3m ch\u1EE9ng n\xE0o trong s\u01A1 \u0111\u1ED3.\n");
  } else {
    process.stdout.write(`${debt.length} m\u1EE5c n\u1EE3 ki\u1EC3m ch\u1EE9ng:
`);
    for (const item of debt) process.stdout.write(`  \xB7 ${item.message}
`);
  }
  return debt.length > 0 || checks.some((c) => c.result === "fail") ? 1 : 0;
}
var MARK2;
var init_trace2 = __esm({
  "src/commands/trace.ts"() {
    "use strict";
    init_trace();
    init_args();
    init_errors();
    init_common2();
    MARK2 = {
      pass: "\u2713",
      fail: "\u2717",
      marginal: "\u2248",
      unavailable: "\u2026",
      unprovable: "\u26A0"
    };
  }
});

// src/debt.ts
function scoreOf(code) {
  const exact = SCORES[code];
  if (exact) return exact;
  const slash = code.indexOf("/");
  if (slash > 0) {
    const fallback = NAMESPACE_DEFAULTS[code.slice(0, slash)];
    if (fallback) return fallback;
  }
  throw new Error(
    `debt.ts: m\xE3 "${code}" kh\xF4ng c\xF3 \u0111i\u1EC3m trong SCORES v\xE0 kh\xF4ng kh\u1EDBp namespace m\u1EB7c \u0111\u1ECBnh n\xE0o (schema/*, verify/*) \u2014 th\xEAm v\xE0o SCORES ho\u1EB7c NAMESPACE_DEFAULTS trong src/debt.ts`
  );
}
function rowMessage(row) {
  switch (row.source.origin) {
    case "diagnostic":
      return row.source.diagnostic.message;
    case "debt-item":
      return row.source.item.message;
    case "icebox": {
      const i = row.source.item;
      return `${i.id} \u2014 ${i.title}`;
    }
    default: {
      const _exhaustive = row.source;
      throw new Error(`rowMessage: origin l\u1EA1 ${JSON.stringify(_exhaustive)}`);
    }
  }
}
function compareRows(a, b) {
  if (b.total !== a.total) return b.total - a.total;
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  const am = rowMessage(a);
  const bm = rowMessage(b);
  if (am !== bm) return am < bm ? -1 : 1;
  return 0;
}
function scopeIndex(graph) {
  const index = /* @__PURE__ */ new Map();
  for (const task of graph.tasks.values()) index.set(task.file, task.value.scope);
  for (const mod of graph.modules.values()) {
    if (mod.value.scope !== void 0) index.set(mod.file, mod.value.scope);
  }
  for (const fact of graph.facts.values()) index.set(fact.file, fact.value.scope);
  for (const claim of graph.claims.values()) index.set(claim.file, claim.value.scope);
  for (const i of graph.icebox.values()) {
    if (i.value.scope !== void 0) index.set(i.file, i.value.scope);
  }
  return index;
}
function scopeOfDebtItem(item, graph) {
  if (item.moduleId === void 0) return void 0;
  return graph.modules.get(item.moduleId)?.value.scope;
}
function debtRows(diagnostics, items, graph) {
  const index = scopeIndex(graph);
  const rows = [];
  for (const diagnostic of diagnostics) {
    const score = scoreOf(diagnostic.code);
    rows.push({
      code: diagnostic.code,
      score,
      total: score.weight + score.ease,
      severity: diagnostic.severity,
      scopeId: index.get(diagnostic.file),
      source: { origin: "diagnostic", diagnostic }
    });
  }
  for (const item of items) {
    const score = scoreOf(item.kind);
    rows.push({
      code: item.kind,
      score,
      total: score.weight + score.ease,
      severity: void 0,
      scopeId: scopeOfDebtItem(item, graph),
      source: { origin: "debt-item", item }
    });
  }
  for (const s of graph.icebox.values()) {
    const i = s.value;
    if (i.status !== "open") continue;
    rows.push({
      // "icebox", KHÔNG có dấu "/": cùng quy ước với ba DebtKind tĩnh
      // ("uncovered-edge", "broken-contract", "unverified-module"). Có dấu
      // "/" thì một ngày nào đó code này sẽ vô tình khớp namespace trong
      // NAMESPACE_DEFAULTS (vd nếu ai đó lỡ đặt "icebox/xxx") và bị chấm điểm
      // sai qua fallback thay vì qua chính bản ghi — cố tình tránh cả khả
      // năng đó bằng cách không có "/" ngay từ đầu.
      code: "icebox",
      // Điểm của CHÍNH bản ghi, KHÔNG qua `scoreOf`/`SCORES` — icebox tự
      // mang điểm của nó lúc phát hiện, không phải một luật tĩnh tra bảng.
      score: { weight: i.weight, ease: i.ease },
      total: i.weight + i.ease,
      severity: void 0,
      scopeId: i.scope,
      source: { origin: "icebox", item: i, file: s.file }
    });
  }
  return rows.sort(compareRows);
}
function rowsInScope(rows, scopeId) {
  return rows.filter((r) => r.scopeId === scopeId);
}
var SCORES, NAMESPACE_DEFAULTS;
var init_debt = __esm({
  "src/debt.ts"() {
    "use strict";
    SCORES = {
      /* --- spine: design ---------------------------------------------------- */
      // Liên kết treo (design → goal/decision/design khác không tồn tại): phá vỡ
      // giả định mà brief/trace dựa vào để suy luận, nhưng cách sửa hầu hết là
      // trỏ lại đúng ID hoặc tạo bản ghi thiếu — một sửa đổi YAML nhỏ.
      "spine/design-missing-goal": { weight: 3, ease: 5 },
      "spine/design-missing-decision": { weight: 3, ease: 5 },
      "spine/design-missing-supersede": { weight: 3, ease: 5 },
      // Thông tin quy trình (goal chưa duyệt, design mồ côi vì goal đã closed) —
      // không sai lệch gì, chỉ nhắc một trạng thái đang chờ.
      "spine/design-serves-draft-goal": { weight: 1, ease: 3 },
      "spine/design-orphaned": { weight: 1, ease: 5 },
      /* --- spine: task -------------------------------------------------------- */
      "spine/task-missing-goal": { weight: 3, ease: 5 },
      "spine/task-missing-design": { weight: 3, ease: 5 },
      "spine/task-goal-not-in-design": { weight: 3, ease: 5 },
      "spine/task-missing-blocker": { weight: 3, ease: 5 },
      "spine/task-missing-module": { weight: 3, ease: 5 },
      // Task "chạm khối" mà không có tiêu chí verification kiểm khối đó — task
      // "done" được mà chưa ai chạy verify: đúng nghĩa "sinh kết luận sai". Sửa
      // cần thêm một mục exit_contract, đôi khi phải viết bằng chứng mới cho khối.
      "spine/task-missing-verification": { weight: 3, ease: 3 },
      // Thiếu `model`: không ai quyết tier — không sai lệch dữ liệu, chỉ là ngỏ.
      "spine/task-missing-model": { weight: 1, ease: 5 },
      // "large": rủi ro compact giữa chừng làm tri thức mất/méo — hỏng nền của
      // chính phiên đó. Sửa = chẻ nhỏ task, một việc thiết kế lại thật sự.
      "spine/task-too-large": { weight: 3, ease: 1 },
      /* --- scope: task/module/phạm vi ----------------------------------------- */
      "scope/task-scope-not-found": { weight: 3, ease: 5 },
      // Có cả lối sửa nhanh (thêm khối vào phạm vi) lẫn lối phải chẻ task — chấm
      // ở mức giữa.
      "scope/task-touches-outside-scope": { weight: 3, ease: 3 },
      "scope/missing-module": { weight: 3, ease: 5 },
      // Phạm vi active mà thiếu tiêu chí nghiệm thu / chưa ai ký: "bàn giao xong"
      // trở thành ý kiến — cùng nhóm "sinh kết luận sai". Thiếu owner sửa bằng
      // một dòng; thiếu acceptance phải viết tiêu chí thật.
      "scope/without-acceptance": { weight: 3, ease: 3 },
      "scope/without-owner": { weight: 1, ease: 5 },
      "scope/module-without-scope": { weight: 1, ease: 5 },
      "scope/module-scope-not-found": { weight: 3, ease: 5 },
      "scope/module-scope-mismatch": { weight: 3, ease: 5 },
      // Khối không nối được vào sơ đồ của phạm vi — không có sẵn "lối sửa nhanh"
      // đúng: nối depends_on nghĩa là quyết định lại kiến trúc luồng.
      "scope/module-orphaned": { weight: 1, ease: 1 },
      /* --- sơ đồ khối --------------------------------------------------------- */
      "spine/module-missing-dependency": { weight: 3, ease: 5 },
      // Có lối sửa nhanh (đổi `to`) nhưng cũng có thể cần tạo khối mới.
      "spine/contract-missing-target": { weight: 3, ease: 5 },
      // Khối chưa có bằng chứng nào — mọi luồng qua nó "không tin được": sinh kết
      // luận sai. Sửa cần viết một bằng chứng (probe/eval) thật, không phải một
      // dòng YAML.
      "verify/module-unverified": { weight: 3, ease: 3 },
      // Eval yếu (ngưỡng/dataset đáng ngờ) đóng dấu xanh giả — cùng mức độ hại,
      // sửa cần cải lại dataset/ngưỡng.
      "verify/eval-weak": { weight: 3, ease: 3 },
      /* --- chu trình: chỉ sửa được bằng cách thiết kế lại phụ thuộc ----------- */
      "spine/module-cycle": { weight: 3, ease: 1 },
      "spine/task-cycle": { weight: 3, ease: 1 },
      "spine/design-cycle": { weight: 3, ease: 1 },
      // Chu trình decision KHÁC hẳn ba cái trên, cả hai trục — đừng chấm theo họ
      // hàng, chấm theo hậu quả:
      //
      // weight 4: chu trình module/task/design là cấu trúc phụ thuộc sai, nhìn ra
      // được. Chu trình decision làm brief loại CẢ CỤM khỏi mục "không được đi
      // ngược" — phiên làm việc không thấy MỘT ràng buộc nào, và không có dấu hiệu
      // gì cho biết có thứ đã bị nuốt. Im lặng tệ hơn sai.
      //
      // ease 5: hai decision khai `supersedes` trỏ vòng vào nhau gần như luôn là
      // gõ nhầm, không phải thiết kế sai — xoá một dòng YAML là xong. Khác chu
      // trình module/task, nơi vòng lặp phản ánh phụ thuộc thật phải gỡ.
      "spine/decision-cycle": { weight: 4, ease: 5 },
      /* --- goal ----------------------------------------------------------------- */
      // Goal active không design nào phục vụ: rủi ro ở tương lai (không có đường
      // đi tới hành động), chưa gây kết luận sai ngay bây giờ. Sửa cần viết một
      // design mới — không phải chỉ đổi một trường.
      "spine/goal-without-design": { weight: 1, ease: 3 },
      /* --- tri thức: fact --------------------------------------------------- */
      // Khai đã verify nhưng sổ cái không có bản ghi khớp — lần verify đó KHÔNG
      // xảy ra: chính là ví dụ "sinh kết luận sai" trong đề bài. Sửa = chạy lại
      // `ganas verify`.
      "knowledge/unbacked-verification": { weight: 3, ease: 3 },
      // Định nghĩa đổi sau lần verify cuối — kết quả cũ đang nói về một thứ khác.
      "knowledge/definition-changed": { weight: 3, ease: 3 },
      "knowledge/result-mismatch": { weight: 3, ease: 3 },
      // Chưa verify lần nào: trung thực về tình trạng của nó (không giả vờ đã
      // kiểm), nên weight thấp hơn hẳn hai mã phía trên — nhưng vẫn phải CHẠY
      // verify thật để sửa, không phải sửa YAML.
      "knowledge/fact-never-verified": { weight: 1, ease: 3 },
      // Probe fail ở lần chạy gần nhất — phát biểu ĐANG sai, đang chủ động đánh
      // lừa bất kỳ ai đọc fact này. Sửa cần điều tra statement hay code sai.
      "knowledge/fact-failing": { weight: 3, ease: 3 },
      "knowledge/fact-missing-promoted-from": { weight: 1, ease: 5 },
      "knowledge/claim-missing-promoted-fact": { weight: 3, ease: 5 },
      // Claim bị bác bỏ: giữ lại làm thông tin ("đừng tin lại"), không có gì để
      // "sửa" — ví dụ đúng nguyên văn của đề bài.
      "knowledge/claim-refuted": { weight: 1, ease: 5 },
      "knowledge/task-missing-fact": { weight: 3, ease: 5 },
      /* --- sổ cái hỏng: mất dữ liệu / hỏng nền -------------------------------- */
      "knowledge/ledger-corrupt": { weight: 5, ease: 1 },
      "knowledge/ledger-chain-broken": { weight: 5, ease: 1 },
      /* --- .gitignore: rò rỉ state riêng vào git ------------------------------ */
      "spine/gitignore-missing-local": { weight: 3, ease: 5 },
      /* --- load: config/YAML/ID trùng ----------------------------------------- */
      // Khoá lạ trong config.yaml (vd gõ sai "enforcment") có thể âm thầm tắt một
      // hàng rào mà người viết tưởng đang bật — sinh kết luận sai đúng nghĩa.
      "spine/config-unknown-key": { weight: 3, ease: 5 },
      // YAML không đọc được / ID trùng bị bỏ qua: cả bản ghi biến mất khỏi graph
      // KHÔNG một tiếng động — downstream coi như nó chưa từng tồn tại.
      "load/yaml": { weight: 3, ease: 5 },
      "load/duplicate-id": { weight: 3, ease: 5 },
      /* --- icebox: luật validate riêng của Icebox (KHÔNG phải hàng "icebox" ---
       * tự mang điểm bên dưới trong `debtRows` — ba mã dưới đây là DIAGNOSTIC do
       * `validateGraph` sinh ra khi một bản ghi icebox tự nó SAI, khác hẳn hàng
       * "icebox" trong bảng nợ vốn không tra SCORES). ------------------------- */
      // Bản sao của `knowledge/claim-missing-promoted-fact` (cũng 3/5): sổ nói
      // "đã thành T-042" mà T-042 không tồn tại ⇒ một quyết định đã ghi đang trỏ
      // vào hư không. Sửa = trỏ lại đúng id hoặc gỡ `promoted_to`.
      "icebox/promoted-missing-task": { weight: 3, ease: 5 },
      // Không sai lệch gì, chỉ nhắc một quyết định tới hạn xem lại — hạng "chỉ là
      // thông tin". ease 3 chứ không 5: đóng nó là một lệnh, nhưng cái phải trả
      // là một QUYẾT ĐỊNH, không phải một dòng YAML.
      "icebox/review-overdue": { weight: 1, ease: 3 },
      // Chấm theo hậu quả, không theo họ hàng (đúng lối lập luận đã ghi cho
      // `spine/decision-cycle`). Anh em gần nhất `scope/module-without-scope` là
      // 1/5, nhưng hậu quả khác hẳn: khối không khai scope vẫn nằm trên sơ đồ;
      // mục icebox không khai scope RƠI KHỎI bảng `ganas debt` mặc định của MỌI
      // task và khỏi báo cáo sau commit — chỉ còn thấy dưới `--all`. Đó là im
      // lặng biến mất khỏi chỗ người thật sự nhìn.
      "icebox/without-scope": { weight: 3, ease: 5 },
      /* --- computeDebt: nợ riêng của sơ đồ khối (DebtKind, không có "/") ------ */
      // Cạnh `depends_on` không cạnh contract nào kiểm — sơ đồ TRÔNG như đã nối
      // nhưng chưa ai kiểm tương thích thật.
      "uncovered-edge": { weight: 3, ease: 3 },
      // Cạnh contract ĐANG fail — tích hợp giữa hai khối thật sự đang gãy ngay
      // lúc này, không phải nguy cơ tương lai: cùng hạng với sổ cái hỏng.
      "broken-contract": { weight: 5, ease: 3 },
      // Trùng điều kiện với `verify/module-unverified` (khối chưa có bằng chứng
      // nào) — chấm giống nhau cho nhất quán.
      "unverified-module": { weight: 3, ease: 3 }
    };
    NAMESPACE_DEFAULTS = {
      schema: { weight: 3, ease: 5 },
      verify: { weight: 3, ease: 3 }
    };
  }
});

// src/commands/debt.ts
var debt_exports = {};
__export(debt_exports, {
  COMMIT_LIMIT: () => COMMIT_LIMIT,
  TEXT_LIMIT: () => TEXT_LIMIT,
  buildDebtRows: () => buildDebtRows,
  commitDebtSummary: () => commitDebtSummary,
  renderDebtSection: () => renderDebtSection,
  run: () => run11,
  scopeFromClaimedTask: () => scopeFromClaimedTask
});
function buildDebtRows(graph, checks) {
  return debtRows(validateGraph(graph), computeDebt(graph, checks), graph);
}
function rowLocation(row) {
  switch (row.source.origin) {
    case "diagnostic": {
      const d = row.source.diagnostic;
      return d.line !== void 0 ? `${d.file}:${d.line}` : d.file;
    }
    case "debt-item": {
      const item = row.source.item;
      if (item.moduleId !== void 0) return item.moduleId;
      if (item.edge !== void 0) return `${item.edge.from} \u2192 ${item.edge.to}`;
      return "";
    }
    case "icebox":
      return formatAnchor(row.source.item.anchors[0]);
    default: {
      const _exhaustive = row.source;
      throw new Error(`rowLocation: origin l\u1EA1 ${JSON.stringify(_exhaustive)}`);
    }
  }
}
function renderRow(row) {
  return `  ${String(row.total).padStart(2)}  ${row.code.padEnd(CODE_WIDTH)} ${rowLocation(row)}`;
}
function renderDebtSection(header, rows, limit) {
  if (rows.length === 0) return `${header} kh\xF4ng c\xF3 n\u1EE3 n\xE0o.
`;
  const shown = rows.slice(0, limit);
  let out = `${header}
` + shown.map(renderRow).join("\n") + "\n";
  const omitted = rows.length - shown.length;
  if (omitted > 0) {
    out += `  \u2026 \u0111\xE3 b\u1ECF b\u1EDBt ${omitted} m\u1EE5c (in ${shown.length}/${rows.length}) \u2014 d\xF9ng \`ganas debt --json\` \u0111\u1EC3 l\u1EA5y \u0111\u1EE7.
`;
  }
  return out;
}
function commitDebtSummary(graph, scopeId) {
  try {
    const rows = buildDebtRows(graph, []);
    const inScope = rowsInScope(rows, scopeId);
    const outside = rows.length - inScope.length;
    if (inScope.length === 0) {
      return outside > 0 ? `
Kh\xF4ng c\xF3 n\u1EE3 trong ph\u1EA1m vi ${scopeId}. Ngo\xE0i ph\u1EA1m vi n\xE0y: c\xF2n ${outside} m\u1EE5c \u2014 \`ganas debt --all\`.
` : "";
    }
    return "\n" + renderDebtSection(`N\u1EE3 trong ph\u1EA1m vi ${scopeId}:`, inScope, COMMIT_LIMIT) + (outside > 0 ? `Ngo\xE0i ph\u1EA1m vi n\xE0y: c\xF2n ${outside} m\u1EE5c \u2014 \`ganas debt --all\`
` : "");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return `
\u26A0 kh\xF4ng d\u1EF1ng \u0111\u01B0\u1EE3c b\u1EA3ng n\u1EE3: ${reason} \u2014 ch\u1EA1y \`ganas debt\` \u0111\u1EC3 xem chi ti\u1EBFt
`;
  }
}
async function scopeFromClaimedTask(argv, root, graph) {
  if (flag(argv, "all")) return void 0;
  const sessionId = option(argv, "session");
  const taskId = await taskForSession(root, sessionId);
  if (!taskId) {
    throw new GanasError(
      `ch\u01B0a bi\u1EBFt \u0111ang l\xE0m task n\xE0o \u2014 kh\xF4ng l\u1ECDc \u0111\u01B0\u1EE3c ph\u1EA1m vi n\u1EE3.
D\xF9ng \`ganas debt --all\` \u0111\u1EC3 xem to\xE0n d\u1EF1 \xE1n, ho\u1EB7c g\u1EAFn task tr\u01B0\u1EDBc b\u1EB1ng \`ganas next\` / \`--session <id>\`.`
    );
  }
  const task = graph.tasks.get(taskId);
  if (!task) throw new GanasError(`kh\xF4ng c\xF3 task ${taskId}`);
  return task.value.scope;
}
async function run11(argv) {
  const { root, graph } = await openProject(argv);
  const checks = await checkAllEdges(graph, root);
  const rows = buildDebtRows(graph, checks);
  const all = flag(argv, "all");
  const scopeId = await scopeFromClaimedTask(argv, root, graph);
  const filtered = scopeId === void 0 ? rows : rowsInScope(rows, scopeId);
  const outside = rows.length - filtered.length;
  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        { scope: scopeId ?? null, all, total: rows.length, shown: filtered.length, outside, rows: filtered },
        null,
        2
      ) + "\n"
    );
    return 0;
  }
  if (all) {
    process.stdout.write(renderDebtSection(`N\u1EE3 to\xE0n d\u1EF1 \xE1n (${rows.length} m\u1EE5c):`, rows, TEXT_LIMIT));
    return 0;
  }
  process.stdout.write(renderDebtSection(`N\u1EE3 trong ph\u1EA1m vi ${scopeId}:`, filtered, TEXT_LIMIT));
  if (outside > 0) {
    process.stdout.write(`
Ngo\xE0i ph\u1EA1m vi n\xE0y: c\xF2n ${outside} m\u1EE5c \u2014 \`ganas debt --all\`
`);
  }
  return 0;
}
var TEXT_LIMIT, COMMIT_LIMIT, CODE_WIDTH;
var init_debt2 = __esm({
  "src/commands/debt.ts"() {
    "use strict";
    init_debt();
    init_trace();
    init_validate();
    init_anchor();
    init_state();
    init_args();
    init_errors();
    init_common2();
    TEXT_LIMIT = 20;
    COMMIT_LIMIT = 8;
    CODE_WIDTH = 28;
  }
});

// src/commands/icebox.ts
var icebox_exports = {};
__export(icebox_exports, {
  overdueIceboxItems: () => overdueIceboxItems,
  run: () => run12
});
import { existsSync as existsSync10 } from "node:fs";
import { mkdir as mkdir6, readFile as readFile11, writeFile as writeFile5 } from "node:fs/promises";
import { dirname as dirname6, join as join11 } from "node:path";
function monthOf(d) {
  return d.toISOString().slice(0, 7);
}
function iceboxRelFile(month) {
  return `${GANAS_DIR}/${DIRS.icebox}/${month}.yaml`;
}
function iceboxLockFile(root, relFile) {
  return ganasPath(root, DIRS.locks, `icebox-${relFile.replace(/[\\/]/g, "_")}.lock`);
}
async function nextIceboxId(graph, root, sessionId, ttlMinutes) {
  let max = 0;
  for (const id of graph.icebox.keys()) {
    if (!ID_PATTERNS.icebox.test(id)) continue;
    const n2 = Number(id.slice("ICE-".length));
    if (Number.isFinite(n2) && n2 > max) max = n2;
  }
  const maxAttempts = 1e3;
  let n = max + 1;
  for (let attempts = 0; attempts < maxAttempts; attempts++, n++) {
    const candidate = `ICE-${String(n).padStart(3, "0")}`;
    if (await reserveId(root, candidate, sessionId, ttlMinutes)) return candidate;
  }
  throw new GanasError(
    `kh\xF4ng \u0111\u1EB7t ch\u1ED7 \u0111\u01B0\u1EE3c id ICE sau ${maxAttempts} l\u1EA7n th\u1EED \u2014 qu\xE1 nhi\u1EC1u id \u0111ang b\u1ECB gi\u1EEF trong .ganas/.locks/. Th\u1EED l\u1EA1i sau, ho\u1EB7c ki\u1EC3m tra c\xF3 phi\xEAn n\xE0o \u0111ang treo gi\u1EEF ch\u1ED7 h\xE0ng lo\u1EA1t kh\xF4ng.`
  );
}
async function appendIceboxRecord(root, month, record2) {
  const relFile = iceboxRelFile(month);
  const file = join11(root, relFile);
  await mkdir6(dirname6(file), { recursive: true });
  await withFileLock(iceboxLockFile(root, relFile), ICEBOX_LOCK_TTL_MS, async () => {
    const raw = existsSync10(file) ? await readFile11(file, "utf8") : "";
    const doc = (0, import_yaml6.parseDocument)(raw);
    if (doc.contents === null) doc.contents = doc.createNode([]);
    doc.addIn([], record2);
    await writeFile5(file, doc.toString(), "utf8");
  });
}
async function writeIceboxUpdate(root, sourced, updates, deleteKeys = []) {
  const file = join11(root, sourced.file);
  const base2 = sourced.index === void 0 ? [] : [sourced.index];
  await withFileLock(iceboxLockFile(root, sourced.file), ICEBOX_LOCK_TTL_MS, async () => {
    const doc = (0, import_yaml6.parseDocument)(await readFile11(file, "utf8"));
    for (const [k, v] of Object.entries(updates)) doc.setIn([...base2, k], v);
    for (const k of deleteKeys) doc.deleteIn([...base2, k]);
    await writeFile5(file, doc.toString(), "utf8");
  });
}
function parseScoreValue(raw, flagLabel) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new GanasError(`${flagLabel} ph\u1EA3i l\xE0 s\u1ED1 nguy\xEAn trong thang 1-5, nh\u1EADn \u0111\u01B0\u1EE3c "${raw}"`);
  }
  return n;
}
async function runAdd(argv, root, graph) {
  const title = option(argv, "title");
  if (!title) throw new GanasError("thi\u1EBFu --title \u2014 icebox ph\u1EA3i c\xF3 ti\xEAu \u0111\u1EC1.");
  const weightRaw = option(argv, "weight");
  if (weightRaw === void 0) {
    throw new GanasError("thi\u1EBFu --weight (1-5) \u2014 quan tr\u1ECDng \u0111\u1EBFn \u0111\xE2u n\u1EBFu b\u1ECF qua?");
  }
  const easeRaw = option(argv, "ease");
  if (easeRaw === void 0) {
    throw new GanasError("thi\u1EBFu --ease (1-5) \u2014 d\u1EC5 s\u1EEDa \u0111\u1EBFn \u0111\xE2u?");
  }
  const weight = parseScoreValue(weightRaw, "--weight");
  const ease = parseScoreValue(easeRaw, "--ease");
  const why = option(argv, "why");
  if (!why) {
    throw new GanasError(
      'thi\u1EBFu --why \u2014 v\xEC sao ho\xE3n? Ghi v\xE0o s\u1ED5 n\xE0y m\xE0 kh\xF4ng n\xF3i v\xEC sao th\xEC quay l\u1EA1i \u0111\xFAng b\u1EC7nh "n\u1EB1m trong \u0111o\u1EA1n chat m\xE0 kh\xF4ng ai t\xECm \u0111\u01B0\u1EE3c" m\xE0 icebox sinh ra \u0111\u1EC3 ch\u1ED1ng.'
    );
  }
  const anchors = multiOption(argv, "anchor");
  if (anchors.length === 0) {
    throw new GanasError(
      "thi\u1EBFu --anchor \u2014 icebox ph\u1EA3i c\xF3 \xEDt nh\u1EA5t m\u1ED9t b\u1EB1ng ch\u1EE9ng (vd `--anchor src/a.ts:12`). L\u1EB7p l\u1EA1i c\u1EDD n\xE0y \u0111\u1EC3 khai nhi\u1EC1u anchor: `--anchor A --anchor B`."
    );
  }
  const scope = option(argv, "scope");
  const reviewAfterRaw = option(argv, "review-after");
  const reviewAfterDays = reviewAfterRaw === void 0 ? 30 : Number(reviewAfterRaw);
  if (!Number.isInteger(reviewAfterDays) || reviewAfterDays < 1) {
    throw new GanasError(`--review-after ph\u1EA3i l\xE0 s\u1ED1 nguy\xEAn ng\xE0y \u22651, nh\u1EADn \u0111\u01B0\u1EE3c "${reviewAfterRaw}"`);
  }
  const sessionId = option(argv, "session") ?? "cli";
  const ttlMinutes = graph.config.claim.ttl_minutes;
  const id = await nextIceboxId(graph, root, sessionId, ttlMinutes);
  const now = /* @__PURE__ */ new Date();
  const month = monthOf(now);
  const record2 = {
    id,
    title,
    found_at: now.toISOString(),
    review_after_days: reviewAfterDays,
    weight,
    ease,
    why_deferred: why,
    anchors,
    ...scope ? { scope } : {},
    status: "open"
  };
  await appendIceboxRecord(root, month, record2);
  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ id, file: iceboxRelFile(month) }, null, 2) + "\n");
    return 0;
  }
  process.stdout.write(`\u0110\xE3 ghi ${id} v\xE0o ${iceboxRelFile(month)}
`);
  return 0;
}
async function runList(argv, root, graph) {
  const scopeId = await scopeFromClaimedTask(argv, root, graph);
  const showClosed = flag(argv, "closed");
  const rows = [...graph.icebox.values()].map((s) => s.value).filter((i) => scopeId === void 0 || i.scope === scopeId).filter((i) => showClosed || i.status === "open").sort((a, b) => a.id.localeCompare(b.id));
  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify({ scope: scopeId ?? null, closed: showClosed, total: rows.length, rows }, null, 2) + "\n"
    );
    return 0;
  }
  if (rows.length === 0) {
    process.stdout.write(
      scopeId ? `Kh\xF4ng c\xF3 m\u1EE5c icebox n\xE0o trong ph\u1EA1m vi ${scopeId}.
` : `Kh\xF4ng c\xF3 m\u1EE5c icebox n\xE0o.
`
    );
    return 0;
  }
  const lines = rows.map((i) => {
    const scopeLabel = i.scope ? ` \xB7 ph\u1EA1m vi ${i.scope}` : " \xB7 \u26A0 ch\u01B0a khai scope";
    const statusLabel = i.status === "open" ? "" : i.status === "closed" ? ` \xB7 CLOSED \u2014 ${i.closed_reason ?? "(thi\u1EBFu closed_reason?!)"}` : ` \xB7 PROMOTED \u2192 ${i.promoted_to ?? "?"}`;
    return `${i.id} \u2014 ${i.title}
  weight ${i.weight} + ease ${i.ease} = ${i.weight + i.ease}${scopeLabel}${statusLabel}`;
  });
  process.stdout.write(lines.join("\n\n") + "\n");
  return 0;
}
function overdueIceboxItems(items, now, overrideDays) {
  return items.filter((i) => i.status === "open").map((i) => {
    const days = overrideDays ?? i.review_after_days;
    const dueAt = Date.parse(i.found_at) + days * DAY_MS2;
    return { item: i, overdueDays: Math.floor((now - dueAt) / DAY_MS2) };
  }).filter((x) => x.overdueDays > 0).sort((a, b) => b.overdueDays - a.overdueDays || a.item.id.localeCompare(b.item.id));
}
function runReview(argv, root, graph) {
  const olderThanRaw = option(argv, "older-than");
  const overrideDays = olderThanRaw === void 0 ? void 0 : Number(olderThanRaw);
  if (overrideDays !== void 0 && (!Number.isFinite(overrideDays) || overrideDays < 0)) {
    throw new GanasError(`--older-than kh\xF4ng ph\u1EA3i s\u1ED1 ng\xE0y h\u1EE3p l\u1EC7: ${olderThanRaw}`);
  }
  const items = [...graph.icebox.values()].map((s) => s.value);
  const overdue = overdueIceboxItems(items, Date.now(), overrideDays);
  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          olderThan: overrideDays ?? null,
          total: overdue.length,
          rows: overdue.map(({ item, overdueDays }) => ({ ...item, overdue_days: overdueDays }))
        },
        null,
        2
      ) + "\n"
    );
    return 0;
  }
  if (overdue.length === 0) {
    process.stdout.write("Kh\xF4ng c\xF3 m\u1EE5c icebox n\xE0o qu\xE1 h\u1EA1n xem l\u1EA1i.\n");
    return 0;
  }
  const lines = overdue.map(({ item: i, overdueDays }) => {
    const anchors = i.anchors.map(formatAnchor).join(", ");
    return `${i.id} \u2014 ${i.title}
  qu\xE1 h\u1EA1n ${overdueDays} ng\xE0y \xB7 weight ${i.weight} + ease ${i.ease} = ${i.weight + i.ease}
  v\xEC sao ho\xE3n: ${i.why_deferred}
  anchors: ${anchors}
  ganas icebox close ${i.id} --reason "..."   |   ganas icebox promote ${i.id} --task T-xxx`;
  });
  process.stdout.write(lines.join("\n\n") + "\n");
  return 0;
}
async function runClose(argv, root, graph) {
  const id = argv.positional[1];
  if (!id) throw new GanasError('thi\u1EBFu <ICE-id> \u2014 d\xF9ng: ganas icebox close <ICE-id> --reason "..."');
  const sourced = graph.icebox.get(id);
  if (!sourced) throw new GanasError(`kh\xF4ng c\xF3 icebox ${id}`);
  const reason = option(argv, "reason");
  if (!reason) {
    throw new GanasError(
      "thi\u1EBFu --reason \u2014 \u0111\xF3ng m\xE0 kh\xF4ng n\xF3i v\xEC sao th\xEC phi\xEAn sau \u0111\u1EC1 xu\u1EA5t l\u1EA1i \u0111\xFAng th\u1EE9 v\u1EEBa b\u1ECB lo\u1EA1i. Kh\xE1c `ganas prune` (m\u1EB7c \u0111\u1ECBnh dry-run v\xEC n\xF3 \u0111\u1EE5ng NHI\u1EC0U th\u1EE9 do m\xE1y ch\u1ECDn): `close` \u0111\u1EE5ng \u0110\xDANG M\u1ED8T id do ng\u01B0\u1EDDi g\xF5 k\xE8m l\xFD do b\u1EAFt bu\u1ED9c, n\xEAn kh\xF4ng c\u1EA7n dry-run."
    );
  }
  const deleteKeys = sourced.value.promoted_to !== void 0 ? ["promoted_to"] : [];
  await writeIceboxUpdate(
    root,
    sourced,
    { status: "closed", closed_at: (/* @__PURE__ */ new Date()).toISOString(), closed_reason: reason },
    deleteKeys
  );
  process.stdout.write(`\u0110\xE3 \u0111\xF3ng ${id}: ${reason}
`);
  return 0;
}
function promoteTemplate(item) {
  const mustRead = item.anchors.map(
    (a) => `    - path: ${JSON.stringify(formatAnchor(a))}
      why: "ph\xE1t hi\u1EC7n l\xFAc g\xE1c l\u1EA1i ${item.id} \u2014 xem l\xFD do ho\xE3n trong .ganas/icebox/"`
  ).join("\n");
  return `Ch\u01B0a g\xE1n --task. Ch\u1EA1y \`ganas id task\` \u0111\u1EC3 l\u1EA5y id th\u1EADt, r\u1ED3i d\xE1n khung d\u01B0\u1EDBi \u0111\xE2y th\xE0nh \`.ganas/tasks/<id>.yaml\`:

# .ganas/tasks/T-xxx.yaml
id: T-xxx
title: ${JSON.stringify(item.title)}
serves: []          # B\u1EAET BU\u1ED8C \u2014 goal n\xE0o? icebox kh\xF4ng bi\u1EBFt, ng\u01B0\u1EDDi quy\u1EBFt.
implements: ""      # B\u1EAET BU\u1ED8C \u2014 design n\xE0o? ng\u01B0\u1EDDi quy\u1EBFt.
scope: ${item.scope ?? "P-x"}${item.scope ? "" : "  # icebox ch\u01B0a khai scope \u2014 t\u1EF1 \u0111i\u1EC1n tr\u01B0\u1EDBc khi d\xF9ng"}
status: todo
context_contract:
  must_read:
${mustRead}
exit_contract: []   # B\u1EAET BU\u1ED8C \u2014 \u0111i\u1EC1u ki\u1EC7n ho\xE0n th\xE0nh, ng\u01B0\u1EDDi quy\u1EBFt

Sau khi t\u1EA1o task th\u1EADt: \`ganas icebox promote ${item.id} --task <id-v\u1EEBa-t\u1EA1o>\`.`;
}
async function runPromote(argv, root, graph) {
  const id = argv.positional[1];
  if (!id) throw new GanasError("thi\u1EBFu <ICE-id> \u2014 d\xF9ng: ganas icebox promote <ICE-id> [--task T-042]");
  const sourced = graph.icebox.get(id);
  if (!sourced) throw new GanasError(`kh\xF4ng c\xF3 icebox ${id}`);
  const item = sourced.value;
  const taskId = option(argv, "task");
  if (!taskId) {
    process.stdout.write(promoteTemplate(item) + "\n");
    return 1;
  }
  const task = graph.tasks.get(taskId);
  if (!task) {
    throw new GanasError(
      `kh\xF4ng c\xF3 task ${taskId} trong graph \u2014 task ph\u1EA3i T\u1ED2N T\u1EA0I TH\u1EACT (v\xE0 h\u1EE3p l\u1EC7 schema) tr\u01B0\u1EDBc khi promote.`
    );
  }
  if (item.scope !== void 0 && task.value.scope !== item.scope) {
    throw new GanasError(
      `icebox ${id} khai scope \`${item.scope}\`, nh\u01B0ng task ${taskId} khai scope \`${task.value.scope}\` \u2014 hai ph\u1EA1m vi ph\u1EA3i kh\u1EDBp khi c\u1EA3 hai c\xF9ng khai.`
    );
  }
  await writeIceboxUpdate(root, sourced, {
    status: "promoted",
    promoted_to: taskId,
    closed_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  process.stdout.write(`\u0110\xE3 th\u0103ng c\u1EA5p ${id} \u2192 ${taskId}.
`);
  return 0;
}
async function run12(argv) {
  const sub = argv.positional[0];
  const { root, graph } = await openProject(argv);
  switch (sub) {
    case "add":
      return runAdd(argv, root, graph);
    case "list":
      return runList(argv, root, graph);
    case "review":
      return runReview(argv, root, graph);
    case "close":
      return runClose(argv, root, graph);
    case "promote":
      return runPromote(argv, root, graph);
    default:
      throw new GanasError(
        `l\u1EC7nh con kh\xF4ng bi\u1EBFt: "${sub ?? ""}" \u2014 c\xF3: add, list, review, close, promote`
      );
  }
}
var import_yaml6, DAY_MS2, ICEBOX_LOCK_TTL_MS;
var init_icebox2 = __esm({
  "src/commands/icebox.ts"() {
    "use strict";
    import_yaml6 = __toESM(require_dist(), 1);
    init_claim();
    init_paths();
    init_model();
    init_args();
    init_errors();
    init_common2();
    init_debt2();
    DAY_MS2 = 24 * 60 * 60 * 1e3;
    ICEBOX_LOCK_TTL_MS = 5e3;
  }
});

// src/commands/search.ts
var search_exports = {};
__export(search_exports, {
  run: () => run13
});
function displayQuery(query, task) {
  if (task) return `task ${task.id} \u2014 "${task.title}"`;
  return `"${query.replace(/\s+/g, " ").trim()}"`;
}
function renderHit(hit, freshness, referenceScope) {
  const state = freshness.get(hit.factId);
  const mark = freshnessMark(state);
  const reasonLine = state && state.freshness !== "fresh" ? `
  L\xDD DO: ${state.reason}` : "";
  const outOfScope = referenceScope !== void 0 && hit.fact.scope !== referenceScope ? `
  \u26A0 NGO\xC0I PH\u1EA0M VI \u0110ANG X\xC9T: fact thu\u1ED9c \`${hit.fact.scope}\`, kh\xF4ng ph\u1EA3i \`${referenceScope}\` \u2014 ch\u01B0a ch\u1EAFc \u0111\xFAng \u1EDF \u0111\xE2y, t\u1EF1 ki\u1EC3m l\u1EA1i tr\u01B0\u1EDBc khi d\u1EF1a v\xE0o` : "";
  return `${mark} ${hit.factId}  (\u0111i\u1EC3m ${hit.score.toFixed(2)})` + reasonLine + `
  ${hit.fact.statement}
  file: ${hit.file}  \xB7  kh\u1EDBp: ${hit.matchedTerms.join(", ")}` + outOfScope;
}
async function run13(argv) {
  const { graph, freshness } = await openProject(argv);
  const taskId = option(argv, "task");
  const queryArg = argv.positional.join(" ").trim();
  let query;
  let task;
  if (taskId) {
    const sourced = graph.tasks.get(taskId);
    if (!sourced) throw new GanasError(`kh\xF4ng c\xF3 task ${taskId}`);
    task = sourced.value;
    query = taskQuery(task);
  } else if (queryArg) {
    query = queryArg;
  } else {
    throw new GanasError(
      `thi\u1EBFu truy v\u1EA5n \u2014 d\xF9ng \`ganas search "<chu\u1ED7i>"\` \u0111\u1EC3 tra theo chu\u1ED7i, ho\u1EB7c \`ganas search --task <id>\` \u0111\u1EC3 d\xF9ng ch\xEDnh task l\xE0m truy v\u1EA5n.`
    );
  }
  const explicitScope = option(argv, "scope");
  const referenceScope = explicitScope ?? task?.scope;
  const limitRaw = option(argv, "limit");
  const limit = limitRaw !== void 0 ? Number(limitRaw) : DEFAULT_LIMIT2;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new GanasError(`--limit ph\u1EA3i l\xE0 s\u1ED1 nguy\xEAn d\u01B0\u01A1ng, nh\u1EADn \u0111\u01B0\u1EE3c "${limitRaw}"`);
  }
  const exclude = task ? task.context_contract.facts : [];
  const all = searchFacts(graph, query, {
    scope: explicitScope,
    exclude,
    limit: Number.MAX_SAFE_INTEGER
  });
  const shown = all.slice(0, limit);
  const omitted = all.length - shown.length;
  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        {
          query,
          task: task?.id ?? null,
          scope: referenceScope ?? null,
          total: all.length,
          shown: shown.length,
          omitted,
          hits: shown.map((h) => {
            const state = freshness.get(h.factId);
            return {
              factId: h.factId,
              score: h.score,
              matchedTerms: h.matchedTerms,
              statement: h.fact.statement,
              scope: h.fact.scope,
              file: h.file,
              outOfScope: referenceScope !== void 0 && h.fact.scope !== referenceScope,
              freshness: state?.freshness ?? null,
              freshnessReason: state?.reason ?? null
            };
          })
        },
        null,
        2
      ) + "\n"
    );
    return 0;
  }
  const shownQuery = displayQuery(query, task);
  if (shown.length === 0) {
    process.stdout.write(`Kh\xF4ng t\xECm th\u1EA5y fact n\xE0o kh\u1EDBp truy v\u1EA5n ${shownQuery}.
`);
    return 0;
  }
  const header = `${all.length} k\u1EBFt qu\u1EA3 cho ${shownQuery}${referenceScope ? ` (ph\u1EA1m vi tham chi\u1EBFu: ${referenceScope})` : ""}:

`;
  const body = shown.map((h) => renderHit(h, freshness, referenceScope)).join("\n\n");
  let out = header + body + "\n";
  if (omitted > 0) {
    out += `
\u2026 \u0111\xE3 b\u1ECF b\u1EDBt ${omitted} m\u1EE5c (in ${shown.length}/${all.length}) \u2014 d\xF9ng \`--limit\` l\u1EDBn h\u01A1n ho\u1EB7c \`--json\` \u0111\u1EC3 l\u1EA5y \u0111\u1EE7.
`;
  }
  process.stdout.write(out);
  return 0;
}
var DEFAULT_LIMIT2;
var init_search2 = __esm({
  "src/commands/search.ts"() {
    "use strict";
    init_freshness();
    init_search();
    init_args();
    init_errors();
    init_common2();
    DEFAULT_LIMIT2 = 10;
  }
});

// src/commit.ts
function buildCommitMessage(graph, task, gate) {
  const lines = [`${task.id}: ${task.title}`, "", "\u0110i\u1EC1u ki\u1EC7n ho\xE0n th\xE0nh:"];
  for (const r of gate.results) {
    const mark = r.status === "pass" ? "\u2713" : r.status === "pending_human" ? "\u2026" : "\u2717";
    lines.push(`  ${mark} ${r.label}`);
  }
  const design = graph.designs.get(task.implements)?.value;
  const context = [
    `ph\u1EE5c v\u1EE5 ${task.serves.join(", ")}`,
    design ? `design ${design.id} \u2014 ${design.title}` : `design ${task.implements}`,
    `ph\u1EA1m vi ${task.scope}`
  ].join(" \xB7 ");
  lines.push("", context);
  return lines.join("\n") + "\n";
}
var init_commit = __esm({
  "src/commit.ts"() {
    "use strict";
  }
});

// src/commands/commit.ts
var commit_exports = {};
__export(commit_exports, {
  parsePorcelainZ: () => parsePorcelainZ,
  run: () => run14
});
import { existsSync as existsSync11 } from "node:fs";
import { mkdtemp as mkdtemp2, readFile as readFile12, rm as rm3, writeFile as writeFile6 } from "node:fs/promises";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join12 } from "node:path";
function quote(p) {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}
function parsePorcelainZ(stdout) {
  const fields = stdout.split("\0");
  const entries = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field || field.length < 4) continue;
    const x = field[0];
    const y = field[1];
    entries.push({ x, y, path: field.slice(3) });
    if (x === "R" || x === "C" || y === "R" || y === "C") {
      const other = fields[++i];
      if (other) entries.push({ x, y, path: other });
    }
  }
  return entries;
}
function notFullyStaged(e) {
  return e.x === "?" || e.y !== " ";
}
function ownedPaths(task, entries) {
  return [...new Set(entries.filter((e) => ownsGanasFile(task, e.path)).map((e) => e.path))];
}
function foreignPaths(task, entries) {
  return [...new Set(entries.filter((e) => !ownsGanasFile(task, e.path)).map((e) => e.path))];
}
async function changedUnder(root, pathspec) {
  if (pathspec.length === 0) return [];
  const spec = pathspec.map(quote).join(" ");
  const res = await runShell(`git status --porcelain -z -uall -- ${spec}`, {
    cwd: root,
    timeoutMs: 15e3
  });
  if (res.code !== 0) return [];
  return parsePorcelainZ(res.stdout);
}
async function closeTaskFile(root, sourced) {
  const file = join12(root, sourced.file);
  const original = await readFile12(file, "utf8");
  const doc = (0, import_yaml7.parseDocument)(original);
  const base2 = sourced.index === void 0 ? [] : [sourced.index];
  doc.setIn([...base2, "status"], "done");
  doc.setIn([...base2, "done_at"], (/* @__PURE__ */ new Date()).toISOString());
  await writeFile6(file, doc.toString(), "utf8");
  return original;
}
function reportBaseline(gate, baseline) {
  const green = alreadyGreen(gate, baseline);
  if (green.length === 0) return "";
  return `
\u26A0 ${green.length} ti\xEAu ch\xED \u0111\xE3 XANH S\u1EB4N t\u1EEB tr\u01B0\u1EDBc khi b\u1EAFt \u0111\u1EA7u task:
` + green.map((r) => `    ${r.label}`).join("\n") + `
  Ho\u1EB7c task n\xE0y \u0111\xE3 xong t\u1EEB tr\u01B0\u1EDBc, ho\u1EB7c ti\xEAu ch\xED \u0111\xF3 kh\xF4ng g\xE1c g\xEC.
  M\u1ED9t gate t\u1EF1 xanh tr\u01B0\u1EDBc khi s\u1EEDa l\xE0 gate kh\xF4ng t\u1ED3n t\u1EA1i.
`;
}
async function run14(argv) {
  const { root, graph, freshness } = await openProject(argv);
  const sessionId = option(argv, "session");
  const taskId = argv.positional[0] ?? option(argv, "task") ?? await taskForSession(root, sessionId);
  if (!taskId) throw new GanasError("ch\u01B0a bi\u1EBFt \u0111ang l\xE0m task n\xE0o \u2014 ch\u1EA1y `ganas next` tr\u01B0\u1EDBc");
  const sourced = graph.tasks.get(taskId);
  if (!sourced) throw new GanasError(`kh\xF4ng c\xF3 task ${taskId}`);
  const task = sourced.value;
  const chain = verifyChain(graph.ledgerRaw);
  if (!chain.ok) {
    throw new GanasError(
      `hash-chain c\u1EE7a s\u1ED5 c\xE1i x\xE1c minh \u0111\u1EE9t \u1EDF d\xF2ng ${(chain.brokenAt ?? 0) + 1} (.ganas/verify-ledger.jsonl).
S\u1ED5 c\xE1i l\xE0 append-only: \u0111\u1EE9t chain ngh\u0129a l\xE0 c\xF3 d\xF2ng b\u1ECB s\u1EEDa, xo\xE1 ho\u1EB7c \u0111\u1EA3o th\u1EE9 t\u1EF1 sau khi ghi. Xem \`ganas ledger --check\` v\xE0 \`ganas validate\`, ph\u1EE5c h\u1ED3i t\u1EEB git tr\u01B0\u1EDBc khi commit ti\u1EBFp.`
    );
  }
  const gateResult = await evaluateGate(graph, task, freshness, sessionId);
  if (!gateResult.ok) {
    process.stdout.write(
      `Ch\u01B0a commit \u0111\u01B0\u1EE3c \u2014 \u0111i\u1EC1u ki\u1EC7n ho\xE0n th\xE0nh c\u1EE7a ${taskId} ch\u01B0a tho\u1EA3:

${formatGate(gateResult)}
`
    );
    return 1;
  }
  const baseline = await baselineFor(root, sessionId, taskId);
  const baselineWarning = reportBaseline(gateResult, baseline);
  const allGanas = flag(argv, "all-ganas");
  const codePaths = taskBoundary(task, graph);
  const touched = await touchedPathsFor(root, sessionId, taskId);
  const outsideWarning = formatBoundaryWarning(
    taskId,
    codePaths,
    touched,
    outsideBoundary(task, graph, touched)
  );
  const willClose = enabled(argv, "close") && task.status !== "done" && gateResult.pendingHuman.length === 0;
  if (flag(argv, "dry-run")) {
    const ganasChanged2 = allGanas ? [] : await changedUnder(root, [GANAS_DIR]);
    const owned2 = ownedPaths(task, ganasChanged2);
    const foreign2 = foreignPaths(task, ganasChanged2);
    const message2 = buildCommitMessage(graph, task, gateResult);
    process.stdout.write(
      `--- ganas commit ${taskId} (dry-run, KH\xD4NG stage, KH\xD4NG commit) ---

S\u1EBD stage:
` + [...allGanas ? [GANAS_DIR] : owned2, ...codePaths].map((p) => `  + ${p}`).join("\n") + (foreign2.length > 0 ? `

\u0110\u1EC3 l\u1EA1i (kh\xF4ng thu\u1ED9c ${taskId}):
` + foreign2.map((p) => `  \xB7 ${p}`).join("\n") : "") + (willClose ? `

S\u1EBD \u0111\xE1nh d\u1EA5u ${taskId}: status: done + done_at.` : "") + baselineWarning + outsideWarning + `

--- commit message ---
${message2}`
    );
    return 0;
  }
  let originalTaskFile = null;
  if (willClose) originalTaskFile = await closeTaskFile(root, sourced);
  const ganasChanged = allGanas ? [] : await changedUnder(root, [GANAS_DIR]);
  const owned = ownedPaths(task, ganasChanged);
  const foreign = foreignPaths(task, ganasChanged);
  for (const p of [...allGanas ? [GANAS_DIR] : owned, ...codePaths]) {
    await runShell(`git add -- ${quote(p)}`, { cwd: root, timeoutMs: 15e3 });
  }
  const staged = await runShell("git diff --cached --quiet", { cwd: root, timeoutMs: 1e4 });
  if (staged.code === 0) {
    if (originalTaskFile !== null) {
      await writeFile6(join12(root, sourced.file), originalTaskFile, "utf8");
    }
    process.stdout.write(
      `Kh\xF4ng c\xF3 g\xEC \u0111\u1EC3 commit \u2014 ph\u1EA1m vi c\u1EE7a ${taskId} \u0111ang s\u1EA1ch.
` + (foreign.length > 0 ? `
${GANAS_DIR}/ c\xF3 ${foreign.length} file \u0111ang \u0111\u1ED5i nh\u01B0ng KH\xD4NG thu\u1ED9c ${taskId}:
` + foreign.map((p) => `  \xB7 ${p}`).join("\n") + `
Commit ch\xFAng c\xF9ng task s\u1EDF h\u1EEFu, ho\u1EB7c \`git add\` tay n\u1EBFu mu\u1ED1n g\u1ED9p.
` : "") + outsideWarning
    );
    return 0;
  }
  const message = buildCommitMessage(graph, task, gateResult);
  const dir = await mkdtemp2(join12(tmpdir2(), "ganas-commit-"));
  try {
    const msgFile = join12(dir, "MSG");
    await writeFile6(msgFile, message, "utf8");
    const result = await runShell(`git commit -F ${quote(msgFile)}`, {
      cwd: root,
      timeoutMs: 3e4
    });
    if (result.code !== 0) {
      if (originalTaskFile !== null) {
        await writeFile6(join12(root, sourced.file), originalTaskFile, "utf8");
      }
      throw new GanasError(`git commit th\u1EA5t b\u1EA1i:
${result.stderr || result.stdout}`);
    }
    process.stdout.write(
      `\u2713 \u0110\xE3 commit cho ${taskId}.

${message}` + (willClose ? `
${taskId} \u0111\xE3 \u0111\xE1nh d\u1EA5u \`status: done\`.
` : "") + (!willClose && gateResult.pendingHuman.length > 0 ? `
${taskId} CH\u01AFA \u0111\xF3ng: c\xF2n ${gateResult.pendingHuman.length} ti\xEAu ch\xED c\u1EA7n ng\u01B0\u1EDDi x\xE1c nh\u1EADn:
` + gateResult.pendingHuman.map((p) => `  \u2026 ${p.label}`).join("\n") + `
` : "") + reportUnstagedContract(task, await unstagedContractPaths(root, task)) + (foreign.length > 0 ? `
${GANAS_DIR}/ c\xF3 ${foreign.length} file \u0111ang \u0111\u1ED5i nh\u01B0ng KH\xD4NG thu\u1ED9c ${taskId} \u2014 \u0111\u1EC3 l\u1EA1i, ch\u01B0a commit:
` + foreign.map((p) => `  \xB7 ${p}`).join("\n") + `
Commit ch\xFAng c\xF9ng task s\u1EDF h\u1EEFu ch\xFAng.
` : "") + baselineWarning + outsideWarning + commitDebtSummary(graph, task.scope)
    );
    return 0;
  } finally {
    await rm3(dir, { recursive: true, force: true });
  }
}
async function unstagedContractPaths(root, task) {
  const existing = contractPathRefs(task).filter((r) => existsSync11(join12(root, r.path)));
  if (existing.length === 0) return [];
  const changed = await changedUnder(
    root,
    existing.map((r) => r.path)
  );
  return [...new Set(changed.filter(notFullyStaged).map((e) => e.path))];
}
function reportUnstagedContract(task, left) {
  if (left.length === 0) return "";
  const refs = contractPathRefs(task);
  return `
\u26A0 ${left.length} file m\xE0 \`exit_contract\` c\u1EE7a ${task.id} ch\u1EA1y v\u1EABn CH\u01AFA v\xE0o git:
` + left.map((p) => {
    const from = refs.find((r) => r.path === p)?.from;
    return `  \xB7 ${p}${from ? `
      ${from}` : ""}`;
  }).join("\n") + `
  Clone v\u1EC1 m\xE1y kh\xE1c, gate c\u1EE7a ${task.id} s\u1EBD \u0111\u1ECF. \`git add\` ch\xFAng r\u1ED3i commit ti\u1EBFp.
`;
}
var import_yaml7;
var init_commit2 = __esm({
  "src/commands/commit.ts"() {
    "use strict";
    import_yaml7 = __toESM(require_dist(), 1);
    init_boundary();
    init_commit();
    init_gate();
    init_paths();
    init_state();
    init_args();
    init_errors();
    init_exec();
    init_ledger();
    init_common2();
    init_debt2();
  }
});

// src/prune.ts
import { existsSync as existsSync12 } from "node:fs";
import { mkdir as mkdir7, readdir as readdir5, rename as rename2, rm as rm4, stat as stat3 } from "node:fs/promises";
import { basename as basename3, dirname as dirname7, join as join13, relative as relative4 } from "node:path";
function notePath(root, sessionId) {
  return join13(ganasPath(root, DIRS.runs), NOTES_DIRNAME, `${sessionId}.md`);
}
async function planPrune(root, graph, opts) {
  const now = opts.now ?? Date.now();
  const cutoff = now - opts.olderThanDays * DAY_MS3;
  const state = await readState(root);
  const runsDir = ganasPath(root, DIRS.runs);
  const notesDir = join13(runsDir, NOTES_DIRNAME);
  const staleRuns = [
    ...await collectStaleIn(runsDir, state, cutoff, now),
    ...await collectStaleIn(notesDir, state, cutoff, now)
  ];
  const deadSessions = [];
  for (const [sessionId, rec] of Object.entries(state.sessions)) {
    const startedAt = Date.parse(rec.started_at);
    if (Number.isNaN(startedAt) || startedAt > cutoff) continue;
    deadSessions.push({ sessionId, ageDays: Math.floor((now - startedAt) / DAY_MS3) });
  }
  const blockedByTargets = /* @__PURE__ */ new Set();
  for (const t of graph.tasks.values()) {
    for (const dep of t.value.blocked_by) blockedByTargets.add(dep);
  }
  const promotedTargets = /* @__PURE__ */ new Set();
  for (const rec of graph.icebox.values()) {
    if (rec.value.promoted_to) promotedTargets.add(rec.value.promoted_to);
  }
  const doneTasks = [];
  for (const t of graph.tasks.values()) {
    if (t.value.status !== "done") continue;
    if (!t.value.done_at) continue;
    if (Date.parse(t.value.done_at) > cutoff) continue;
    if (blockedByTargets.has(t.value.id)) continue;
    if (promotedTargets.has(t.value.id)) continue;
    doneTasks.push({ id: t.value.id, file: t.file });
  }
  const iceboxFiles = collectClosedIceboxFiles(graph.icebox, cutoff, now);
  return { staleRuns, deadSessions, doneTasks, iceboxFiles };
}
function collectClosedIceboxFiles(icebox, cutoff, now) {
  const byFile = /* @__PURE__ */ new Map();
  for (const rec of icebox.values()) {
    const list = byFile.get(rec.file);
    if (list) list.push(rec);
    else byFile.set(rec.file, [rec]);
  }
  const out = [];
  for (const [file, recs] of byFile) {
    if (recs.some((r) => r.value.status === "open")) continue;
    let latestClosedAt = -Infinity;
    for (const r of recs) {
      const t = r.value.closed_at ? Date.parse(r.value.closed_at) : NaN;
      if (!Number.isNaN(t)) latestClosedAt = Math.max(latestClosedAt, t);
    }
    if (!Number.isFinite(latestClosedAt)) continue;
    if (latestClosedAt > cutoff) continue;
    out.push({
      month: basename3(file, ".yaml"),
      file,
      ageDays: Math.floor((now - latestClosedAt) / DAY_MS3)
    });
  }
  return out;
}
async function collectStaleIn(dir, state, cutoff, now) {
  const out = [];
  if (!existsSync12(dir)) return out;
  for (const entry of await readdir5(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const sessionId = entry.name.slice(0, -3);
    if (state.sessions[sessionId]) continue;
    const file = join13(dir, entry.name);
    const mtimeMs = (await stat3(file)).mtimeMs;
    if (mtimeMs > cutoff) continue;
    out.push({ sessionId, file, ageDays: Math.floor((now - mtimeMs) / DAY_MS3) });
  }
  return out;
}
function quote2(p) {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}
async function archive(root, relFile, archiveDirName) {
  const src = join13(root, relFile);
  const dstRel = join13(dirname7(relFile), archiveDirName, basename3(relFile));
  const dst = join13(root, dstRel);
  await mkdir7(dirname7(dst), { recursive: true });
  if (existsSync12(join13(root, ".git"))) {
    const result = await runShell(
      `git mv -- ${quote2(relative4(root, src))} ${quote2(relative4(root, dst))}`,
      { cwd: root, timeoutMs: 15e3 }
    );
    if (result.code === 0) return dstRel;
  }
  await rename2(src, dst);
  return dstRel;
}
async function applyPrune(root, plan) {
  for (const r of plan.staleRuns) {
    await rm4(r.file, { force: true });
  }
  if (plan.deadSessions.length > 0) {
    const state = await readState(root);
    for (const d of plan.deadSessions) delete state.sessions[d.sessionId];
    await writeState(root, state);
  }
  for (const t of plan.doneTasks) await archive(root, t.file, "done");
  for (const f of plan.iceboxFiles) await archive(root, f.file, "closed");
}
var NOTES_DIRNAME, DAY_MS3;
var init_prune = __esm({
  "src/prune.ts"() {
    "use strict";
    init_paths();
    init_state();
    init_exec();
    NOTES_DIRNAME = "notes";
    DAY_MS3 = 864e5;
  }
});

// src/commands/note.ts
var note_exports = {};
__export(note_exports, {
  run: () => run15
});
import { existsSync as existsSync13 } from "node:fs";
import { appendFile as appendFile3, mkdir as mkdir8, writeFile as writeFile7 } from "node:fs/promises";
import { dirname as dirname8 } from "node:path";
async function gitSha(root) {
  const result = await runShell("git rev-parse --short HEAD", { cwd: root, timeoutMs: 5e3 });
  return result.code === 0 ? result.stdout.trim() : void 0;
}
function renderHead(sessionId) {
  return `# Ghi ch\xE9p th\xF4 c\u1EE7a phi\xEAn \`${sessionId}\` \u2014 CH\u01AFA KI\u1EC2M, KH\xD4NG PH\u1EA2I tri th\u1EE9c d\u1EF1 \xE1n

M\u1ED7i m\u1EE5c d\u01B0\u1EDBi \u0111\xE2y l\xE0 m\u1ED9t ghi ch\xFA r\u1EDDi, kh\xF4ng c\xF3 anchor, kh\xF4ng \u0111i qua verify.
KH\xD4NG \u0111\u01B0\u1EE3c coi l\xE0 fact hay tr\xEDch d\u1EABn nh\u01B0 tri th\u1EE9c \u0111\xE3 ki\u1EC3m ch\u1EE9ng. Mu\u1ED1n n\xE2ng c\u1EA5p
m\u1ED9t \u0111i\u1EC1u \u1EDF \u0111\xE2y th\xE0nh tri th\u1EE9c th\xEC \u0111i \u0111\u01B0\u1EDDng claim \u2192 verify \u2192 fact.
`;
}
function renderEntry(opts) {
  const lines = [
    "",
    "---",
    "",
    `## ${opts.at}`,
    "",
    `- task: \`${opts.taskId ?? "(kh\xF4ng r\xF5)"}\``
  ];
  if (opts.sha) lines.push(`- sha: \`${opts.sha}\``);
  lines.push(
    `- file \u0111\xE3 \u0111\u1EE5ng: ${opts.touchedPaths.length ? opts.touchedPaths.map((p) => `\`${p}\``).join(", ") : "(ch\u01B0a \u0111\u1EE5ng file n\xE0o)"}`,
    "",
    opts.content
  );
  return lines.join("\n") + "\n";
}
async function run15(argv) {
  const content = argv.positional.join(" ").trim();
  if (!content) {
    throw new GanasError(`c\u1EA7n n\u1ED9i dung ghi ch\xFA \u2014 vd: ganas note "ch\u01B0a r\xF5 v\xEC sao webhook retry 3 l\u1EA7n"`);
  }
  const root = requireGanasRoot(option(argv, "root") ?? process.cwd());
  const sessionId = option(argv, "session") ?? DEFAULT_SESSION_LABEL;
  const taskId = await taskForSession(root, sessionId);
  const touchedPaths = taskId ? await touchedPathsFor(root, sessionId, taskId) : [];
  const sha = await gitSha(root);
  const at2 = (/* @__PURE__ */ new Date()).toISOString();
  const path = notePath(root, sessionId);
  await mkdir8(dirname8(path), { recursive: true });
  const entry = renderEntry({ at: at2, taskId, sha, touchedPaths, content });
  if (existsSync13(path)) {
    await appendFile3(path, entry, "utf8");
  } else {
    await writeFile7(path, renderHead(sessionId) + entry, "utf8");
  }
  process.stdout.write(`\u0110\xE3 ghi note v\xE0o ${path}
`);
  return 0;
}
var DEFAULT_SESSION_LABEL;
var init_note = __esm({
  "src/commands/note.ts"() {
    "use strict";
    init_paths();
    init_prune();
    init_state();
    init_args();
    init_errors();
    init_exec();
    DEFAULT_SESSION_LABEL = "manual";
  }
});

// src/handoff.ts
import { existsSync as existsSync14 } from "node:fs";
import { mkdir as mkdir9, readFile as readFile13, writeFile as writeFile8 } from "node:fs/promises";
import { dirname as dirname9 } from "node:path";
function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter(
    (b) => typeof b === "object" && b !== null && b.type === "text"
  ).map((b) => b.text).join("\n");
}
function pushUnique(list, seen, value) {
  if (!value || seen.has(value)) return;
  seen.add(value);
  list.push(value);
}
function parseTranscript(raw) {
  const userMessages = [];
  const filesWritten = [];
  const filesRead = [];
  const commandsRun = [];
  const seenWritten = /* @__PURE__ */ new Set();
  const seenRead = /* @__PURE__ */ new Set();
  const seenCommands = /* @__PURE__ */ new Set();
  const toolCounts = {};
  let startedAt;
  let endedAt;
  let turnCount = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const timestamp = typeof obj["timestamp"] === "string" ? obj["timestamp"] : void 0;
    if (timestamp) {
      if (!startedAt || timestamp < startedAt) startedAt = timestamp;
      if (!endedAt || timestamp > endedAt) endedAt = timestamp;
    }
    if (obj["type"] !== "user" && obj["type"] !== "assistant") continue;
    const message = obj["message"];
    if (!message) continue;
    turnCount++;
    if (obj["type"] === "user") {
      if (obj["isMeta"] === true) continue;
      const text = textOf(message.content).trim();
      if (!text || SYNTHETIC_PREFIXES.some((p) => text.startsWith(p))) continue;
      userMessages.push(text.replace(/\s*\n\s*/g, " "));
      continue;
    }
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (typeof block !== "object" || block === null) continue;
      const b = block;
      if (b["type"] !== "tool_use") continue;
      const name = typeof b["name"] === "string" ? b["name"] : "?";
      toolCounts[name] = (toolCounts[name] ?? 0) + 1;
      const input = b["input"];
      const filePath = input?.["file_path"];
      const command = input?.["command"];
      if (WRITE_TOOL_NAMES.has(name) && typeof filePath === "string") {
        pushUnique(filesWritten, seenWritten, filePath);
      } else if (name === "Read" && typeof filePath === "string") {
        pushUnique(filesRead, seenRead, filePath);
      } else if ((name === "Bash" || name === "PowerShell") && typeof command === "string") {
        pushUnique(commandsRun, seenCommands, command);
      }
    }
  }
  return {
    startedAt,
    endedAt,
    turnCount,
    userMessages,
    filesWritten,
    filesRead,
    commandsRun,
    toolCounts
  };
}
function bulletOrNote(items, note) {
  return items.length ? items.map((i) => `- ${i}`).join("\n") : note;
}
function renderHandoff(args) {
  const { sessionId, task, gate, graph, transcript: t } = args;
  const claims = [...graph.claims.values()].filter((c) => c.value.source_session === sessionId).map((c) => `\`${c.value.id}\` \u2014 ${c.value.statement} (${c.value.trust})`);
  const facts = [...graph.facts.values()].filter((f) => f.value.verified_by === sessionId).map((f) => `\`${f.value.id}\` \u2014 ${f.value.statement} (${f.value.last_result})`);
  const head = [`# Handoff \u2014 ${sessionId}`, "", `- task: \`${task.id}\` \u2014 ${task.title}`];
  if (t?.startedAt) head.push(`- b\u1EAFt \u0111\u1EA7u: ${t.startedAt}`);
  if (t?.endedAt) head.push(`- k\u1EBFt th\xFAc: ${t.endedAt}`);
  head.push(`- ${t?.turnCount ?? 0} l\u01B0\u1EE3t trong transcript`);
  const actions = [
    t && t.filesWritten.length ? `- S\u1EEDa/t\u1EA1o: ${t.filesWritten.map((f) => `\`${f}\``).join(", ")}` : "- (kh\xF4ng c\xF3 file n\xE0o b\u1ECB s\u1EEDa)"
  ];
  if (t && t.commandsRun.length) {
    actions.push(`- L\u1EC7nh \u0111\xE3 ch\u1EA1y: ${t.commandsRun.map((c) => `\`${c}\``).join(", ")}`);
  }
  const lines = [
    ...head,
    "",
    "## Y\xEAu c\u1EA7u trong phi\xEAn (nguy\xEAn v\u0103n ng\u01B0\u1EDDi d\xF9ng, tr\xEDch t\u1EEB transcript)",
    "",
    bulletOrNote(
      t?.userMessages ?? [],
      t ? "(kh\xF4ng c\xF3 tin nh\u1EAFn n\xE0o ngo\xE0i l\u1EC7nh h\u1EC7 th\u1ED1ng)" : "(kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c transcript c\u1EE7a phi\xEAn n\xE0y)"
    ),
    "",
    "## H\xE0nh \u0111\u1ED9ng (tr\xEDch c\u01A1 h\u1ECDc t\u1EEB transcript, kh\xF4ng ph\u1EA3i t\u01B0\u1EDDng thu\u1EADt)",
    "",
    actions.join("\n"),
    "",
    "## Tri th\u1EE9c \u0111\xE3 ghi trong phi\xEAn (c\xF3 b\u1EB1ng ch\u1EE9ng, tra \u0111\u01B0\u1EE3c trong .ganas/)",
    "",
    bulletOrNote([...facts, ...claims], "(kh\xF4ng c\xF3 fact/claim n\xE0o g\u1EAFn v\u1EDBi phi\xEAn n\xE0y)")
  ];
  if (task.context_contract.open_questions.length > 0) {
    lines.push("", "## C\xE2u h\u1ECFi c\xF2n m\u1EDF", "", bulletOrNote(task.context_contract.open_questions, ""));
  }
  lines.push("", `## \u0110i\u1EC1u ki\u1EC7n ho\xE0n th\xE0nh c\u1EE7a ${task.id}`, "", formatGate(gate));
  return lines.join("\n") + "\n";
}
function runsPath(root, sessionId) {
  return ganasPath(root, DIRS.runs, `${sessionId}.md`);
}
async function generateHandoff(root, graph, task, gate, opts) {
  let transcript = null;
  if (opts.transcriptPath && existsSync14(opts.transcriptPath)) {
    try {
      transcript = parseTranscript(await readFile13(opts.transcriptPath, "utf8"));
    } catch {
      transcript = null;
    }
  }
  const content = renderHandoff({ sessionId: opts.sessionId, task, gate, graph, transcript });
  const path = runsPath(root, opts.sessionId);
  await mkdir9(dirname9(path), { recursive: true });
  await writeFile8(path, content, "utf8");
  return { path, content };
}
var WRITE_TOOL_NAMES, SYNTHETIC_PREFIXES;
var init_handoff = __esm({
  "src/handoff.ts"() {
    "use strict";
    init_gate();
    init_paths();
    WRITE_TOOL_NAMES = /* @__PURE__ */ new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
    SYNTHETIC_PREFIXES = ["<local-command-", "<command-name>", "<system-reminder>"];
  }
});

// src/commands/handoff.ts
var handoff_exports = {};
__export(handoff_exports, {
  run: () => run16
});
async function run16(argv) {
  const { root, graph, freshness } = await openProject(argv);
  const sessionId = option(argv, "session");
  if (!sessionId) {
    throw new GanasError(
      "c\u1EA7n --session <id> \u2014 handoff g\u1EAFn v\u1EDBi \u0111\xFAng m\u1ED9t phi\xEAn, ganas kh\xF4ng t\u1EF1 \u0111o\xE1n \u0111\u01B0\u1EE3c phi\xEAn n\xE0o."
    );
  }
  const taskId = option(argv, "task") ?? await taskForSession(root, sessionId);
  if (!taskId) throw new GanasError(`kh\xF4ng bi\u1EBFt phi\xEAn ${sessionId} \u0111ang l\xE0m task n\xE0o`);
  const sourced = graph.tasks.get(taskId);
  if (!sourced) throw new GanasError(`kh\xF4ng c\xF3 task ${taskId}`);
  const gate = await evaluateGate(graph, sourced.value, freshness, sessionId);
  const { path, content } = await generateHandoff(root, graph, sourced.value, gate, {
    sessionId,
    transcriptPath: option(argv, "transcript")
  });
  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ path, ok: gate.ok }, null, 2) + "\n");
    return 0;
  }
  process.stdout.write(`\u0110\xE3 ghi handoff: ${path}

${content}`);
  return 0;
}
var init_handoff2 = __esm({
  "src/commands/handoff.ts"() {
    "use strict";
    init_gate();
    init_handoff();
    init_state();
    init_args();
    init_errors();
    init_common2();
  }
});

// src/commands/prune.ts
var prune_exports = {};
__export(prune_exports, {
  run: () => run17
});
function summarize(plan) {
  const lines = [];
  if (plan.staleRuns.length > 0) {
    lines.push(`${plan.staleRuns.length} handoff c\u0169 (phi\xEAn \u0111\xE3 k\u1EBFt th\xFAc) s\u1EBD b\u1ECB XO\xC1:`);
    for (const r of plan.staleRuns)
      lines.push(`  - ${r.file} (${r.ageDays} ng\xE0y, session ${r.sessionId})`);
  }
  if (plan.deadSessions.length > 0) {
    lines.push(`${plan.deadSessions.length} session m\u1ED3 c\xF4i trong state.json s\u1EBD b\u1ECB g\u1EE1:`);
    for (const d of plan.deadSessions)
      lines.push(`  - ${d.sessionId} (${d.ageDays} ng\xE0y, ch\u01B0a t\u1EEBng release)`);
  }
  if (plan.doneTasks.length > 0) {
    lines.push(`${plan.doneTasks.length} task done s\u1EBD chuy\u1EC3n sang tasks/done/:`);
    for (const t of plan.doneTasks) lines.push(`  - ${t.id} (${t.file})`);
  }
  if (plan.iceboxFiles.length > 0) {
    lines.push(`${plan.iceboxFiles.length} file icebox \u0111\xE3 \u0111\xF3ng h\u1EBFt s\u1EBD chuy\u1EC3n sang icebox/closed/:`);
    for (const f of plan.iceboxFiles) lines.push(`  - ${f.month} (${f.ageDays} ng\xE0y, ${f.file})`);
  }
  return lines.join("\n");
}
async function run17(argv) {
  const { root, graph } = await openProject(argv);
  const olderThanRaw = option(argv, "older-than");
  const olderThanDays = olderThanRaw === void 0 ? DEFAULT_OLDER_THAN_DAYS : Number(olderThanRaw);
  if (Number.isNaN(olderThanDays) || olderThanDays < 0) {
    throw new GanasError(`--older-than kh\xF4ng ph\u1EA3i s\u1ED1 ng\xE0y h\u1EE3p l\u1EC7: ${olderThanRaw}`);
  }
  const plan = await planPrune(root, graph, { olderThanDays });
  const total = plan.staleRuns.length + plan.deadSessions.length + plan.doneTasks.length + plan.iceboxFiles.length;
  const apply = flag(argv, "yes", "y");
  if (flag(argv, "json")) {
    process.stdout.write(JSON.stringify({ ...plan, applied: apply && total > 0 }, null, 2) + "\n");
  } else if (total === 0) {
    process.stdout.write(`Kh\xF4ng c\xF3 g\xEC c\u1EA7n d\u1ECDn (ng\u01B0\u1EE1ng ${olderThanDays} ng\xE0y).
`);
  } else {
    process.stdout.write(`${summarize(plan)}
`);
  }
  if (total === 0) return 0;
  if (!apply) {
    if (!flag(argv, "json")) {
      process.stdout.write(
        `
\u0110\xE2y l\xE0 dry-run \u2014 ch\u01B0a \u0111\u1EE5ng g\xEC t\u1EDBi \u0111\u0129a. Ch\u1EA1y l\u1EA1i v\u1EDBi --yes \u0111\u1EC3 th\u1EF1c thi.
`
      );
    }
    return 0;
  }
  await applyPrune(root, plan);
  if (!flag(argv, "json")) process.stdout.write(`
\u2713 \u0110\xE3 d\u1ECDn xong.
`);
  return 0;
}
var DEFAULT_OLDER_THAN_DAYS;
var init_prune2 = __esm({
  "src/commands/prune.ts"() {
    "use strict";
    init_prune();
    init_args();
    init_errors();
    init_common2();
    DEFAULT_OLDER_THAN_DAYS = 7;
  }
});

// src/commands/ledger.ts
var ledger_exports = {};
__export(ledger_exports, {
  run: () => run18
});
async function run18(argv) {
  const root = requireGanasRoot(process.cwd());
  const entries = await readLedger(root);
  const corrupt = ledgerCorruption(root);
  const chain = verifyChain(entries);
  if (flag(argv, "json")) {
    process.stdout.write(
      JSON.stringify(
        { entries: entries.length, corrupt_lines: corrupt, chain_ok: chain.ok, broken_at: chain.brokenAt ?? null },
        null,
        2
      ) + "\n"
    );
    return chain.ok && corrupt === 0 ? 0 : 1;
  }
  if (!chain.ok) {
    process.stderr.write(
      `\u2717 Hash-chain c\u1EE7a s\u1ED5 c\xE1i x\xE1c minh \u0110\u1EE8T \u1EDF d\xF2ng ${(chain.brokenAt ?? 0) + 1}/${entries.length}.
  .ganas/verify-ledger.jsonl l\xE0 append-only. \u0110\u1EE9t chain ngh\u0129a l\xE0 c\xF3 d\xF2ng b\u1ECB s\u1EEDa,
  xo\xE1 ho\u1EB7c \u0111\u1EA3o th\u1EE9 t\u1EF1 SAU khi ghi.

  Ph\u1EE5c h\u1ED3i t\u1EEB git (\`git checkout -- .ganas/verify-ledger.jsonl\`) r\u1ED3i ch\u1EA1y l\u1EA1i
  \`ganas verify\` cho nh\u1EEFng g\xEC th\u1EADt s\u1EF1 c\u1EA7n ki\u1EC3m.
`
    );
    return 1;
  }
  if (corrupt > 0) {
    process.stderr.write(
      `\u2717 S\u1ED5 c\xE1i c\xF3 ${corrupt} d\xF2ng kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c. Hash-chain c\u1EE7a ph\u1EA7n \u0111\u1ECDc \u0111\u01B0\u1EE3c v\u1EABn li\u1EC1n,
  nh\u01B0ng d\xF2ng h\u1ECFng l\xE0 ch\u1ED7 b\u1EB1ng ch\u1EE9ng bi\u1EBFn m\u1EA5t m\xE0 kh\xF4ng \u0111\u1EC3 l\u1EA1i d\u1EA5u v\u1EBFt.
`
    );
    return 1;
  }
  process.stdout.write(`\u2713 S\u1ED5 c\xE1i li\u1EC1n chain \u2014 ${entries.length} d\xF2ng.
`);
  return 0;
}
var init_ledger2 = __esm({
  "src/commands/ledger.ts"() {
    "use strict";
    init_paths();
    init_args();
    init_ledger();
  }
});

// src/hooks/io.ts
async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function writeHookOutput(output) {
  process.stdout.write(JSON.stringify(output));
}
function degraded(message) {
  return { systemMessage: `ganas kh\xF4ng ch\u1EA1y \u0111\u01B0\u1EE3c (\u0111ang b\u1ECF qua ki\u1EC3m so\xE1t): ${message}` };
}
var ALLOW;
var init_io = __esm({
  "src/hooks/io.ts"() {
    "use strict";
    ALLOW = {};
  }
});

// src/hooks/handlers.ts
import { stat as stat4 } from "node:fs/promises";
import { isAbsolute, relative as relative5, resolve as resolve3 } from "node:path";
function isAnchorIssue(d) {
  return d.message.includes("anchor") || d.message.includes("b\u1EB1ng ch\u1EE9ng");
}
function formatDiagnostics(diags) {
  return diags.map((d) => {
    const where = d.line === void 0 ? d.file : `${d.file}:${d.line}`;
    return `  ${where}
    ${d.message}${d.hint ? `
    \u2192 ${d.hint}` : ""}`;
  }).join("\n");
}
async function sessionStart(input) {
  const root = findGanasRoot(input.cwd ?? process.cwd());
  if (!root) return ALLOW;
  const graph = await loadGraph(root);
  const sessionId = input.session_id;
  const bound = sessionId ? await taskForSession(root, sessionId) : null;
  const existing = bound ? graph.tasks.get(bound) : void 0;
  let picked;
  if (existing && existing.value.status !== "done") {
    if (sessionId)
      await claimTask(root, existing.value.id, sessionId, graph.config.claim.ttl_minutes);
    picked = { task: existing, blockers: [] };
  } else {
    picked = sessionId ? await claimNextTask(graph, root, sessionId, { preferScope: existing?.value.scope }) : selectNextTask(graph, { preferScope: existing?.value.scope });
  }
  if (!picked) {
    const heldByOthers = rankedCandidates(graph).length;
    const body = heldByOthers > 0 ? `D\u1EF1 \xE1n n\xE0y d\xF9ng ganas, nh\u01B0ng ${heldByOthers} task c\xF2n l\xE0m \u0111\u01B0\u1EE3c \u0111ang b\u1ECB phi\xEAn kh\xE1c gi\u1EEF. \u0110\u1EE3i phi\xEAn \u0111\xF3 gi\u1EA3i ph\xF3ng, ho\u1EB7c ph\u1ED1i h\u1EE3p tr\u01B0\u1EDBc khi gi\xE0nh l\u1EA1i.` : `D\u1EF1 \xE1n n\xE0y d\xF9ng ganas, nh\u01B0ng hi\u1EC7n **kh\xF4ng c\xF3 task n\xE0o l\xE0m \u0111\u01B0\u1EE3c**.

Tr\u01B0\u1EDBc khi s\u1EEDa code, h\xE3y t\u1EA1o task trong \`.ganas/tasks/\` (ph\u1EA3i khai \`serves\`, \`implements\`, \`scope\`, \`exit_contract\`) r\u1ED3i ch\u1EA1y \`ganas validate\`.`;
    return {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: `# ganas

${body}`
      }
    };
  }
  const taskId = picked.task.value.id;
  if (sessionId) await bindSession(root, sessionId, taskId);
  const freshness = await computeFreshness(graph);
  const brief = renderBrief({ graph, task: picked.task, freshness });
  const errors = validateGraph(graph).filter((d) => d.severity === "error");
  const graphWarning = errors.length > 0 ? `

> \u26A0 Graph ganas \u0111ang c\xF3 ${errors.length} l\u1ED7i. Ch\u1EA1y \`ganas validate\` \u2014 brief b\xEAn tr\xEAn c\xF3 th\u1EC3 thi\u1EBFu ch\xEDnh x\xE1c.` : "";
  const out = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: brief + graphWarning,
      sessionTitle: `${taskId} \u2014 ${picked.task.value.title}`
    }
  };
  if (graph.config.session_start.auto_begin && input.source === "startup") {
    out.hookSpecificOutput["initialUserMessage"] = `B\u1EAFt \u0111\u1EA7u ${taskId}. \u0110\u1ECDc brief \u0111\xE3 \u0111\u01B0\u1EE3c n\u1EA1p, l\xE0m theo th\u1EE9 t\u1EF1 trong \u0111\xF3. Verify l\u1EA1i m\u1ECDi m\u1EE5c n\u1EB1m trong "C\u1EA6N VERIFY L\u1EA0I" tr\u01B0\u1EDBc khi d\u1EF1a v\xE0o ch\xFAng.`;
  }
  return out;
}
function denyPreTool(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  };
}
function isEntityPath(rel) {
  return ENTITY_DIRS.some((dir) => rel.startsWith(`${GANAS_DIR}/${dir}/`));
}
async function fileExists(path) {
  try {
    await stat4(path);
    return true;
  } catch {
    return false;
  }
}
async function pendingDispatchNudge(root, sessionId, fromSubagent) {
  const rec = await sessionRecord(root, sessionId);
  if (!rec) return void 0;
  if (await dispatchNudgedFor(root, sessionId, rec.task)) return void 0;
  if (fromSubagent) return void 0;
  const graph = await loadGraph(root);
  const tier = graph.tasks.get(rec.task)?.value.model;
  if (tier !== "scribe" && tier !== "verifier") return void 0;
  return DISPATCH_NUDGE_REASON;
}
async function preToolUse(input) {
  const cwd = input.cwd ?? process.cwd();
  const root = findGanasRoot(cwd);
  if (!root) return ALLOW;
  if (input.tool_name && WRITE_TOOLS.has(input.tool_name)) {
    const raw = input.tool_input?.["file_path"];
    if (typeof raw === "string") {
      const abs = isAbsolute(raw) ? raw : resolve3(cwd, raw);
      if (abs === ledgerPath(root)) return denyPreTool(LEDGER_REASON);
      if (abs === ganasPath(root, CONFIG_FILE)) return denyPreTool(CONFIG_REASON);
      const rel = relative5(root, abs).split("\\").join("/");
      if (input.agent_id && rel.startsWith(SKILL_DIR)) return denyPreTool(SKILL_WRITE_REASON);
      if (input.tool_name === "Write" && isEntityPath(rel) && await fileExists(abs)) {
        return denyPreTool(ENTITY_OVERWRITE_REASON);
      }
    }
    return ALLOW;
  }
  if (input.tool_name === "Bash" || input.tool_name === "PowerShell") {
    const command = input.tool_input?.["command"];
    if (typeof command === "string" && SHELL_WRITE_HINTS.some((h) => command.includes(h))) {
      if (input.session_id) await markTouched(root, input.session_id);
    }
  }
  return ALLOW;
}
async function postToolUse(input) {
  if (input.tool_name === "ExitPlanMode") {
    return { systemMessage: PLAN_APPROVED_REASON };
  }
  if (!input.tool_name || !WRITE_TOOLS.has(input.tool_name)) return ALLOW;
  const cwd = input.cwd ?? process.cwd();
  const root = findGanasRoot(cwd);
  if (!root) return ALLOW;
  const raw = input.tool_input?.["file_path"];
  const abs = typeof raw === "string" ? isAbsolute(raw) ? raw : resolve3(cwd, raw) : void 0;
  const rel = abs === void 0 ? void 0 : relative5(root, abs).split("\\").join("/");
  const inTree = rel !== void 0 && rel !== "" && !rel.startsWith("../");
  const sessionId = input.session_id;
  const fromSubagent = input.agent_id !== void 0;
  if (sessionId) await markTouched(root, sessionId, inTree ? rel : void 0, fromSubagent);
  const nudgeText = sessionId ? await pendingDispatchNudge(root, sessionId, fromSubagent) : void 0;
  const deliverNudge = async () => {
    if (nudgeText === void 0 || sessionId === void 0) return ALLOW;
    await markDispatchNudged(root, sessionId);
    return { systemMessage: nudgeText };
  };
  if (rel === void 0) return deliverNudge();
  if (!rel.startsWith(`${GANAS_DIR}/`)) return deliverNudge();
  const graph = await loadGraph(root);
  const all = validateGraph(graph);
  const mine = all.filter((d) => d.severity === "error" && d.file === rel);
  if (mine.length === 0) return deliverNudge();
  const rule = mine.some(isAnchorIssue) ? "knowledge_anchor" : "schema";
  const mode = enforcementFor(graph.config, rule);
  const nudgeTail = nudgeText === void 0 ? "" : `

---

${nudgeText}`;
  if (nudgeText !== void 0 && sessionId !== void 0) {
    await markDispatchNudged(root, sessionId);
  }
  const body = `Ghi v\xE0o \`${rel}\` ch\u01B0a h\u1EE3p l\u1EC7:

${formatDiagnostics(mine)}

` + (rule === "knowledge_anchor" ? `Kho tri th\u1EE9c ch\u1EC9 nh\u1EADn ph\xE1t bi\u1EC3u c\xF3 b\u1EB1ng ch\u1EE9ng. Th\xEAm anchor (\`file:line\`, \`commit:sha\`, ho\u1EB7c URL k\xE8m \`fetched_at\`), ho\u1EB7c b\u1ECF h\u1EB3n ph\xE1t bi\u1EC3u \u0111\xF3 ra v\xE0 ghi v\xE0o \`open_questions\` c\u1EE7a task.` : `S\u1EEDa l\u1EA1i cho \u0111\xFAng schema r\u1ED3i ghi l\u1EA1i. Xem \`.claude/rules/ganas-knowledge.md\`.`) + nudgeTail;
  return mode === "enforce" ? { decision: "block", reason: body } : { systemMessage: `ganas (ch\u1EBF \u0111\u1ED9 warn \u2014 ch\u01B0a ch\u1EB7n):
${body}` };
}
async function stop(input) {
  if (input.stop_hook_active) return ALLOW;
  const root = findGanasRoot(input.cwd ?? process.cwd());
  if (!root) return ALLOW;
  const sessionId = input.session_id;
  if (!sessionId) return ALLOW;
  const session = await sessionRecord(root, sessionId);
  if (!session?.touched_at) return ALLOW;
  const taskId = session.task;
  const graph = await loadGraph(root);
  const task = graph.tasks.get(taskId);
  if (!task) return ALLOW;
  await clearTouched(root, sessionId);
  const freshness = await computeFreshness(graph);
  const result = await evaluateGate(graph, task.value, freshness, sessionId);
  if (result.ok && result.pendingHuman.length === 0) return ALLOW;
  const unmetText = result.unmet.map((u) => `  \u2717 ${u.label}${u.reason ? `
      ${u.reason}` : ""}`).join("\n");
  if (result.ok) {
    return {
      systemMessage: `${taskId}: m\u1ECDi ti\xEAu ch\xED t\u1EF1 \u0111\u1ED9ng \u0111\xE3 \u0111\u1EA1t. C\xF2n ${result.pendingHuman.length} m\u1EE5c c\u1EA7n ng\u01B0\u1EDDi x\xE1c nh\u1EADn tr\u01B0\u1EDBc khi \u0111\xE1nh d\u1EA5u task done:
` + result.pendingHuman.map((p) => `  \u2026 ${p.label}`).join("\n")
    };
  }
  const mode = enforcementFor(graph.config, "exit_contract");
  const body = `Task ${taskId} ch\u01B0a tho\u1EA3 \u0111i\u1EC1u ki\u1EC7n ho\xE0n th\xE0nh:

${unmetText}

L\xE0m n\u1ED1t nh\u1EEFng m\u1EE5c tr\xEAn r\u1ED3i h\xE3y k\u1EBFt th\xFAc. N\u1EBFu th\u1EADt s\u1EF1 kh\xF4ng l\xE0m \u0111\u01B0\u1EE3c, ghi r\xF5 l\xFD do v\xE0o handoff (\`ganas handoff\`) v\xE0 n\xF3i cho ng\u01B0\u1EDDi d\xF9ng bi\u1EBFt m\u1EE5c n\xE0o c\xF2n d\u1EDF \u2014 \u0111\u1EEBng im l\u1EB7ng b\u1ECF qua.`;
  return mode === "enforce" ? { decision: "block", reason: body } : { systemMessage: `ganas (ch\u1EBF \u0111\u1ED9 warn \u2014 ch\u01B0a ch\u1EB7n):
${body}` };
}
async function tryHandoff(root, input) {
  if (!input.session_id) return void 0;
  const taskId = await taskForSession(root, input.session_id);
  if (!taskId) return void 0;
  try {
    const graph = await loadGraph(root);
    const task = graph.tasks.get(taskId);
    if (!task) return void 0;
    const freshness = await computeFreshness(graph);
    const gate = await evaluateGate(graph, task.value, freshness, input.session_id);
    return await generateHandoff(root, graph, task.value, gate, {
      sessionId: input.session_id,
      transcriptPath: input.transcript_path
    });
  } catch {
    return void 0;
  }
}
async function preCompact(input) {
  const root = findGanasRoot(input.cwd ?? process.cwd());
  if (!root) return ALLOW;
  const taskId = await taskForSession(root, input.session_id);
  if (!taskId) return ALLOW;
  const handoff = await tryHandoff(root, input);
  const handoffNote = handoff ? `

\u0110\xE3 ghi handoff: ${relative5(root, handoff.path)}.` : "";
  return {
    systemMessage: `ganas: context s\u1EAFp b\u1ECB n\xE9n. Tr\u01B0\u1EDBc khi m\u1EA5t chi ti\u1EBFt, ghi nh\u1EEFng g\xEC \u0111\xE3 x\xE1c l\u1EADp ra file: fact \u0111\xE3 verify v\xE0o .ganas/facts/, \u0111i\u1EC1u ch\u01B0a ki\u1EC3m ch\u1EE9ng v\xE0o .ganas/claims/ (k\xE8m anchor), c\xE2u h\u1ECFi c\xF2n m\u1EDF v\xE0o task ${taskId}.` + handoffNote
  };
}
async function sessionEnd(input) {
  const root = findGanasRoot(input.cwd ?? process.cwd());
  if (!root || !input.session_id) return ALLOW;
  await tryHandoff(root, input);
  await releaseClaimsForSession(root, input.session_id);
  await releaseSession(root, input.session_id);
  return ALLOW;
}
var WRITE_TOOLS, SHELL_WRITE_HINTS, LEDGER_REASON, CONFIG_REASON, SKILL_DIR, SKILL_WRITE_REASON, ENTITY_DIRS, ENTITY_OVERWRITE_REASON, PLAN_APPROVED_REASON, DISPATCH_NUDGE_REASON;
var init_handlers = __esm({
  "src/hooks/handlers.ts"() {
    "use strict";
    init_gate();
    init_claim();
    init_freshness();
    init_load();
    init_paths();
    init_select();
    init_validate();
    init_handoff();
    init_model();
    init_brief();
    init_state();
    init_ledger();
    init_io();
    WRITE_TOOLS = /* @__PURE__ */ new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
    SHELL_WRITE_HINTS = [">", ">>", "tee", "sed -i", "truncate", "rm ", "mv ", "cp ", "dd "];
    LEDGER_REASON = `\`${LEDGER_FILE}\` l\xE0 s\u1ED5 c\xE1i x\xE1c minh \u2014 b\u1EB1ng ch\u1EE9ng r\u1EB1ng probe \u0111\xE3 th\u1EADt s\u1EF1 ch\u1EA1y. Ch\u1EC9 \`ganas verify\` m\u1EDBi \u0111\u01B0\u1EE3c ghi v\xE0o \u0111\xF3.

Mu\u1ED1n m\u1ED9t fact \u0111\u01B0\u1EE3c coi l\xE0 \u0111\xE3 ki\u1EC3m ch\u1EE9ng th\xEC ch\u1EA1y \`ganas verify <id>\` cho probe ch\u1EA1y th\u1EADt, \u0111\u1EEBng ghi k\u1EBFt qu\u1EA3 b\u1EB1ng tay. N\u1EBFu probe \u0111ang fail th\xEC \u0111\xF3 l\xE0 th\xF4ng tin c\u1EA7n gi\u1EEF, kh\xF4ng ph\u1EA3i th\u1EE9 c\u1EA7n che \u0111i.`;
    CONFIG_REASON = `\`.ganas/${CONFIG_FILE}\` gi\u1EEF m\u1EE9c c\u01B0\u1EE1ng ch\u1EBF c\u1EE7a c\u1EA3 d\u1EF1 \xE1n. Ghi \`enforcement: warn\` v\xE0o \u0111\xF3 l\xE0 t\u1EF1 t\u1EAFt m\u1ECDi h\xE0ng r\xE0o trong \u0111\xFAng phi\xEAn \u0111ang b\u1ECB h\xE0ng r\xE0o ch\u1EB7n \u2014 v\xF2ng l\u1EB7p m\xE0 kh\xF4ng lu\u1EADt n\xE0o b\xEAn trong ganas ph\xE1 \u0111\u01B0\u1EE3c.

M\u1EE9c c\u01B0\u1EE1ng ch\u1EBF l\xE0 quy\u1EBFt \u0111\u1ECBnh c\u1EE7a NG\u01AF\u1EDCI, s\u1EEDa ngo\xE0i phi\xEAn agent. N\u1EBFu m\u1ED9t lu\u1EADt \u0111ang ch\u1EB7n sai th\xEC n\xEAu ra \u0111\u1EC3 ng\u01B0\u1EDDi x\u1EED l\xFD, \u0111\u1EEBng h\u1EA1 lu\u1EADt xu\u1ED1ng.`;
    SKILL_DIR = `.claude/skills/`;
    SKILL_WRITE_REASON = `Sub-agent kh\xF4ng \u0111\u01B0\u1EE3c s\u1EEDa skill trong \`${SKILL_DIR}\` \u2014 ch\u1EC9 phi\xEAn ch\xEDnh m\u1EDBi \u0111\u01B0\u1EE3c. Skill \u0111\u1ECBnh h\xECnh C\xC1CH l\xE0m vi\u1EC7c; \u0111\u1EC3 sub-agent t\u1EF1 \u0111\u1ED5i n\xF3 gi\u1EEFa l\xFAc ch\u1EA1y l\xE0 m\u1EA5t ki\u1EC3m so\xE1t, phi\xEAn ch\xEDnh kh\xF4ng bi\u1EBFt n\xF3 \u0111\xE3 \u0111\u1ED5i g\xEC.

Nh\u1EDD phi\xEAn ch\xEDnh s\u1EEDa h\u1ED9 n\u1EBFu skill c\u1EA7n c\u1EADp nh\u1EADt.`;
    ENTITY_DIRS = [
      DIRS.goals,
      DIRS.designs,
      DIRS.tasks,
      DIRS.scopes,
      DIRS.modules,
      DIRS.facts,
      DIRS.claims,
      DIRS.decisions,
      DIRS.icebox
    ];
    ENTITY_OVERWRITE_REASON = `File n\xE0y \u0111\xE3 t\u1ED3n t\u1EA1i trong m\u1ED9t th\u01B0 m\u1EE5c th\u1EF1c th\u1EC3 c\u1EE7a ganas. \`Write\` s\u1EBD GHI \u0110\xC8 \xC2M TH\u1EA6M l\xEAn n\xF3 \u2014 kh\xF4ng c\xF3 g\xEC b\xE1o cho phi\xEAn \u0111ang gi\u1EEF n\u1ED9i dung c\u0169 bi\u1EBFt n\xF3 v\u1EEBa m\u1EA5t d\u1EEF li\u1EC7u.

Mu\u1ED1n S\u1EECA file c\xF3 s\u1EB5n th\xEC d\xF9ng \`Edit\`, kh\xF4ng d\xF9ng \`Write\`.

N\u1EBFu t\u01B0\u1EDFng \u0111ang t\u1EA1o m\u1ED9t th\u1EF1c th\u1EC3 M\u1EDAI: id n\xE0y \u0111\xE3 c\xF3 ch\u1EE7. Ch\u1EA1y \`ganas id <lo\u1EA1i>\` \u0111\u1EC3 l\u1EA5y m\u1ED9t id kh\xE1c, \u0111\u1EEBng t\u1EF1 \u0111o\xE1n s\u1ED1 k\u1EBF ti\u1EBFp.`;
    PLAN_APPROVED_REASON = `Plan v\u1EEBa \u0111\u01B0\u1EE3c duy\u1EC7t \u0111ang n\u1EB1m trong context \u2014 v\xE0 s\u1EBD M\u1EA4T khi context b\u1ECB compact. Ch\u1EBB ngay th\xE0nh Task, \u0111\u1EEBng \u0111\u1EC3 sau.

D\xF9ng skill \`plan-to-tasks\`: n\xF3 \u0111\xE3 d\u1EA1y \u0111\u1EE7 c\xE1c b\u01B0\u1EDBc, kh\xF4ng c\u1EA7n \u0111\u1ECDc l\u1EA1i plan t\u1EEB \u0111\xE2u c\u1EA3. C\u1EA5p ID th\u1EADt ngay b\u1EB1ng \`ganas id task --count N\` \u2014 \u0111\u1EEBng d\xF9ng nh\xE3n t\u1EA1m ki\u1EC3u T1, T4a.

Nh\u01B0ng ph\xE1t hi\u1EC7n KH\xD4NG thu\u1ED9c plan n\xE0y \u2014 th\u1EA5y d\u1ECDc \u0111\u01B0\u1EDDng, ch\u01B0a ai duy\u1EC7t \u2014 th\xEC \u0111\u1EEBng nh\xE9t th\xE0nh Task cho \u0111\u1EE7 b\u1ED9: \`serves\`/\`implements\`/\`exit_contract\` b\u1ECBa ra l\xE0 d\u1EEF li\u1EC7u gi\u1EA3. Ghi v\xE0o s\u1ED5 icebox b\u1EB1ng \`ganas icebox add\`. Task l\xE0 \u0111\xE3 quy\u1EBFt L\xC0M; icebox l\xE0 \u0111\xE3 quy\u1EBFt CH\u01AFA l\xE0m, k\xE8m \u0111i\u1EC3m, l\xFD do v\xE0 ng\xE0y xem l\u1EA1i. C\xE1i repo n\xE0y kh\xF4ng cho ph\xE9p t\u1ED3n t\u1EA1i l\xE0 m\u1ED9t vi\u1EC7c ch\u01B0a quy\u1EBFt g\xEC c\u1EA3, n\u1EB1m l\u01A1 l\u1EEDng \u2014 icebox kh\xF4ng ph\u1EA3i th\u1EE9 \u0111\xF3.`;
    DISPATCH_NUDGE_REASON = `Task \u0111ang l\xE0m khai tier r\u1EBB h\u01A1n \`main\` (\`scribe\`/\`verifier\`) \u2014 vi\u1EC7c c\u01A1 h\u1ECDc ho\u1EB7c ki\u1EC3m ch\u1EE9ng, kh\xF4ng c\u1EA7n model m\u1EA1nh nh\u1EA5t. Nh\u01B0ng phi\xEAn ch\xEDnh \u0111ang t\u1EF1 s\u1EEDa file thay v\xEC giao vi\u1EC7c.

Vi\u1EC7c c\u01A1 h\u1ECDc l\xE0m b\u1EB1ng model m\u1EA1nh nh\u1EA5t ch\xEDnh l\xE0 ch\u1ED7 over-engineering sinh ra. Brief \u0111\xE3 n\u1EA1p c\xF3 s\u1EB5n h\u01B0\u1EDBng d\u1EABn giao sub-agent \u1EDF m\u1EE5c "Giao vi\u1EC7c" (k\xE8m alias model) \u2014 d\xF9ng n\xF3.

(Ch\u1EC9 nh\u1EAFc m\u1ED9t l\u1EA7n trong phi\xEAn n\xE0y \u2014 kh\xF4ng l\u1EB7p l\u1EA1i \u1EDF nh\u1EEFng l\u01B0\u1EE3t s\u1EEDa ti\u1EBFp theo.)`;
  }
});

// src/commands/hook.ts
var hook_exports = {};
__export(hook_exports, {
  run: () => run19
});
async function run19(argv) {
  const event = argv.positional[0];
  const handler = event ? HANDLERS[event] : void 0;
  if (!handler) {
    writeHookOutput(
      degraded(`kh\xF4ng bi\u1EBFt hook "${event ?? ""}" (c\xF3: ${Object.keys(HANDLERS).join(", ")})`)
    );
    return 0;
  }
  let input;
  try {
    input = await readHookInput();
  } catch {
    writeHookOutput(ALLOW);
    return 0;
  }
  try {
    writeHookOutput(await handler(input));
  } catch (err) {
    writeHookOutput(degraded(err instanceof Error ? err.message : String(err)));
  }
  return 0;
}
var HANDLERS;
var init_hook = __esm({
  "src/commands/hook.ts"() {
    "use strict";
    init_handlers();
    init_io();
    HANDLERS = {
      "session-start": sessionStart,
      "pre-tool-use": preToolUse,
      "post-tool-use": postToolUse,
      stop,
      "pre-compact": preCompact,
      "session-end": sessionEnd
    };
  }
});

// src/cli.ts
init_args();
init_errors();
var COMMANDS = {
  flow: () => Promise.resolve().then(() => (init_flow2(), flow_exports)),
  init: () => Promise.resolve().then(() => (init_init(), init_exports)),
  validate: () => Promise.resolve().then(() => (init_validate2(), validate_exports)),
  scope: () => Promise.resolve().then(() => (init_scope2(), scope_exports)),
  id: () => Promise.resolve().then(() => (init_id(), id_exports)),
  brief: () => Promise.resolve().then(() => (init_brief2(), brief_exports)),
  next: () => Promise.resolve().then(() => (init_next(), next_exports)),
  gate: () => Promise.resolve().then(() => (init_gate2(), gate_exports)),
  verify: () => Promise.resolve().then(() => (init_verify(), verify_exports)),
  trace: () => Promise.resolve().then(() => (init_trace2(), trace_exports)),
  debt: () => Promise.resolve().then(() => (init_debt2(), debt_exports)),
  icebox: () => Promise.resolve().then(() => (init_icebox2(), icebox_exports)),
  search: () => Promise.resolve().then(() => (init_search2(), search_exports)),
  commit: () => Promise.resolve().then(() => (init_commit2(), commit_exports)),
  note: () => Promise.resolve().then(() => (init_note(), note_exports)),
  handoff: () => Promise.resolve().then(() => (init_handoff2(), handoff_exports)),
  prune: () => Promise.resolve().then(() => (init_prune2(), prune_exports)),
  ledger: () => Promise.resolve().then(() => (init_ledger2(), ledger_exports)),
  hook: () => Promise.resolve().then(() => (init_hook(), hook_exports))
};
var HELP = `ganas \u2014 control layer cho c\xE1c phi\xEAn Claude Code

C\xE1ch d\xF9ng:
  ganas <l\u1EC7nh> [tu\u1EF3 ch\u1ECDn]

L\u1EC7nh:
  flow                 B\u01B0\u1EDBc k\u1EBF ti\u1EBFp c\u1EE7a d\xF2ng ch\u1EA3y (c\u0169ng l\xE0 \`ganas\` kh\xF4ng tham s\u1ED1)
  init                 Kh\u1EDFi t\u1EA1o .ganas/ cho d\u1EF1 \xE1n m\u1EDBi (greenfield)
  validate             Ki\u1EC3m tra graph: schema, li\xEAn k\u1EBFt, lu\u1EADt spine
  scope [new|assign]   Ph\u1EA1m vi c\xF4ng vi\u1EC7c: li\u1EC7t k\xEA, t\u1EA1o m\u1EDBi (ph\u1ECFng v\u1EA5n), v\xE1 ch\u1ED7 qu\xEAn khai
  id <lo\u1EA1i>            C\u1EA5p id k\u1EBF ti\u1EBFp (goal/design/task/claim/decision/fact)
  next                 Ch\u1ECDn task k\u1EBF ti\u1EBFp v\xE0 in brief \u0111\u1EA7y \u0111\u1EE7
  brief [task]         In brief c\u1EE7a m\u1ED9t task
  gate [task]          Ch\u1EA5m \u0111i\u1EC1u ki\u1EC7n ho\xE0n th\xE0nh c\u1EE7a task
  verify [target...]   Ch\u1EA1y b\u1EB1ng ch\u1EE9ng: probe v\xE0 eval, ghi s\u1ED5 c\xE1i (--scope l\u1ECDc theo ph\u1EA1m vi)
  trace                Ki\u1EC3m t\u01B0\u01A1ng th\xEDch c\u1EA1nh (contract), in s\u01A1 \u0111\u1ED3 kh\u1ED1i, b\xE1o n\u1EE3 ki\u1EC3m ch\u1EE9ng (--scope)
  debt [--all]         B\u1EA3ng x\u1EBFp h\u1EA1ng n\u1EE3 theo ph\u1EA1m vi task \u0111ang l\xE0m (--all: to\xE0n d\u1EF1 \xE1n)
  icebox [add|list|review|close|promote]
                       S\u1ED5 vi\u1EC7c \u0111\xE3 quy\u1EBFt CH\u01AFA l\xE0m: ghi, xem l\u1EA1i khi t\u1EDBi h\u1EA1n, \u0111\xF3ng, th\u0103ng c\u1EA5p
                       Vi\u1EC7c \u0111\xE3 quy\u1EBFt CH\u01AFA l\xE0m \u2014 ghi, xem, xem l\u1EA1i qu\xE1 h\u1EA1n, \u0111\xF3ng, ho\u1EB7c l\xEAn task
  search <chu\u1ED7i>       T\xECm fact li\xEAn quan (BM25) \u2014 ho\u1EB7c --task \u0111\u1EC3 d\xF9ng ch\xEDnh task l\xE0m truy v\u1EA5n
  commit [task]        Commit task \u0111\xE3 \u0111\u1EA1t gate \u2014 message d\u1EF1ng t\u1EEB d\u1EEF li\u1EC7u \u0111\xE3 ki\u1EC3m ch\u1EE9ng
  note "..."           Ghi ch\xFA th\xF4 c\u1EE7a phi\xEAn v\xE0o .ganas/runs/notes/ (ch\u01B0a ki\u1EC3m, kh\xF4ng ph\u1EA3i fact)
  handoff --session id Ghi b\u1EA3n ghi ti\u1EBFp n\u1ED1i c\u1EE7a phi\xEAn, d\u1EABn xu\u1EA5t t\u1EEB transcript
  prune                D\u1ECDn ephemeral c\u0169, archive task done (m\u1EB7c \u0111\u1ECBnh dry-run)
  ledger --check       Ki\u1EC3m hash-chain c\u1EE7a s\u1ED5 c\xE1i x\xE1c minh (d\xF9ng trong hook pre-commit)
  hook <event>         \u0110i\u1EC3m v\xE0o cho hook Claude Code (\u0111\u1ECDc JSON \u1EDF stdin)

Tu\u1EF3 ch\u1ECDn chung:
  -C, --cwd <path>     Ch\u1EA1y nh\u01B0 th\u1EC3 \u0111ang \u1EDF th\u01B0 m\u1EE5c n\xE0y
      --session <id>   G\u1EAFn thao t\xE1c v\u1EDBi m\u1ED9t phi\xEAn c\u1EE5 th\u1EC3
      --json           Xu\u1EA5t JSON thay v\xEC v\u0103n b\u1EA3n
  -h, --help           Hi\u1EC7n tr\u1EE3 gi\xFAp
  -v, --version        Hi\u1EC7n phi\xEAn b\u1EA3n
`;
async function main() {
  const raw = process.argv.slice(2);
  const argv = parseArgs(raw);
  if (argv.flags["version"] || argv.flags["v"]) {
    process.stdout.write(`${"0.5.0"}
`);
    return 0;
  }
  if (argv.flags["help"] || argv.flags["h"]) {
    process.stdout.write(HELP);
    return 0;
  }
  const name = argv.positional[0] ?? "flow";
  const load = COMMANDS[name];
  if (!load) {
    process.stderr.write(`ganas: kh\xF4ng c\xF3 l\u1EC7nh "${name}"

${HELP}`);
    return 1;
  }
  const cwd = argv.options["cwd"] ?? argv.options["C"];
  if (cwd) process.chdir(cwd);
  const mod = await load();
  return await mod.run({ ...argv, positional: argv.positional.slice(1) });
}
main().then((code) => {
  process.exitCode = code;
}).catch((err) => {
  if (err instanceof GanasError) {
    process.stderr.write(`ganas: ${err.message}
`);
    process.exitCode = err.exitCode;
    return;
  }
  process.stderr.write(
    `ganas: l\u1ED7i kh\xF4ng l\u01B0\u1EDDng tr\u01B0\u1EDBc
${String(err instanceof Error ? err.stack : err)}
`
  );
  process.exitCode = 70;
});
