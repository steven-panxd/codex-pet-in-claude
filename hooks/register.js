"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = void 0;
var claude_code_1 = require("claude-code");
var draw_1 = require("./draw");
var FRAME_MS = 160;
// the timer's period while nothing moves: a hidden band, a resting pet
var REST_MS = 1000;
// calm: a pet that is idle, waiting or up for review plays its frames
// through, then holds the first this long, so a quiet session draws little
var CALM_REST_MS = 8000;
var CALM_MOODS = new Set(['idle', 'waiting', 'review']);
var REVIEW_MS = 20000;
var FLASH_MS = 2500;
var FAILED_MS = 6000;
var JUMP_MS = 5 * FRAME_MS; // the jump's five frames, once through
// how long background agents a turn left behind may keep the pet at work
// with no word of them: one that ends unseen must not pin it there
var AGENTS_CAP_MS = 15 * 60000;
var DESKTOP_HEIGHT = { small: 72, medium: 104, large: 156 }; // CSS pixels
// a terminal that shows images: rows the picture takes, and the fewest worth drawing
var IMAGE_ROWS = { small: 4, medium: 6, large: 9 };
var IMAGE_MIN_ROWS = 3;
var JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' };
// what may run scripts/pet.mjs, in the order tried: an app started from the
// dock has a short PATH, so the usual homes of node are named too
var RUNNERS = [['node'], ['bun'], ['/opt/homebrew/bin/node'], ['/usr/local/bin/node']];
var SCRIPT_TIMEOUT_MS = 60000;
var SHELL_TIMEOUT_MS = 20000;
var STORE_PET = 'pet'; // the id /pet use chose, across sessions
var STORE_WARNED = 'warned'; // the last problem toasted, so it is said once
var STORE_RUNNER = 'runner'; // the command that ran the script last time
var mood = (0, claude_code_1.atom)({ plugin: 'codex-pet', key: 'mood' }, 'idle');
var isHidden = (0, claude_code_1.atom)({ plugin: 'codex-pet', key: 'isHidden' }, false);
var step = (0, claude_code_1.atom)({ plugin: 'codex-pet', key: 'step' }, 0);
var loads = (0, claude_code_1.atom)({ plugin: 'codex-pet', key: 'loads' }, 0);
var SOURCE = {
    installed: 'installed in ~/.codex/pets',
    'codex-app': 'from the Codex app',
    bundled: 'bundled',
};
// The module's own state: lost on a reload, which loads the pet again.
var settings = { pet: 'auto', size: 'medium', animation: 'calm', hasLabel: true, images: 'auto', align: 'left' };
var pet;
var runner;
// What the session's events say. The main loop's turn is running; agents its
// last stop left in flight; and what waits on the person: the calls that are
// a question to them, the tools a permission dialog is open for, and the
// inputs an MCP server asked for.
var isTurnRunning = false;
var agentsInFlight = 0;
var agentsCap;
var questions = new Set();
var permissions = [];
var elicitations = 0;
// tool calls in flight, by id: which tool each is
var calls = new Map();
// tools the person just refused at the dialog: their error is no failure
var refused = [];
// calls whose run-in-background pill the terminal drew, a sign the call is
// past its dialog; the timer settles them, since a render hook writes nothing
var pilled = new Set();
var started = [];
// The mood the events have asked for; the band draws the `mood` atom, which
// follows it. Only `show` writes it.
var target = 'idle';
var generation = 0;
var revert;
// What the band last drew, for the frame timer.
var bandId;
// undefined until the band is first drawn: until then the desktop's frames
// are read too, so its first drawing has them
var isOnDesktop;
var terminalSize = 'lo';
// whether this terminal shows images (the kitty graphics protocol), as far as
// its environment says; and what the band drew last, a picture or half blocks
var hasImages = false;
var isImageDrawn = false;
// the picture drawn has not been repainted yet: the first repaint says
// whether the terminal took it or drew its text in its place
var isImageUnproven = false;
var ticks = 0;
var frame = 0;
var restedMs = 0;
var timer;
var isTicking = false;
var cells = new Map();
function removeOne(list, item) {
    var at = list.indexOf(item);
    if (at >= 0) {
        list.splice(at, 1);
    }
    return at >= 0;
}
// The mood with nothing passing over it: waiting on the person comes first.
function baseMood() {
    if (questions.size > 0 || permissions.length > 0 || elicitations > 0) {
        return 'waiting';
    }
    return isTurnRunning || agentsInFlight > 0 ? 'running' : 'idle';
}
function isBase(one) {
    return one === 'idle' || one === 'running' || one === 'waiting';
}
// The frame timer, one period from now: after a change, and after each tick.
function wake($, delay) {
    if (delay === void 0) { delay = FRAME_MS; }
    timer === null || timer === void 0 ? void 0 : timer.cancel();
    timer = $.clock.after(delay, function () { return void tick($); });
}
// Shows `to`. Given `after`, it then moves on to `then`, or to the base mood
// as it stands by then; a `review` goes back to the base in its own time.
function show($, to, after, then) {
    return __awaiter(this, void 0, void 0, function () {
        var mine, wait;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    generation += 1;
                    mine = generation;
                    revert === null || revert === void 0 ? void 0 : revert.cancel();
                    wait = after !== null && after !== void 0 ? after : (to === 'review' ? REVIEW_MS : undefined);
                    revert = wait === undefined ? undefined : $.clock.after(wait, function () { return void show($, then !== null && then !== void 0 ? then : baseMood()); });
                    target = to;
                    ticks = 0;
                    frame = 0;
                    restedMs = 0;
                    if (!(isOnDesktop !== false)) return [3 /*break*/, 2];
                    return [4 /*yield*/, ensurePaths($, to)];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    // a later `show` came in meanwhile: this one is not what is wanted now
                    if (mine !== generation) {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, (0, claude_code_1.update)($, mood, function () { return to; })];
                case 3:
                    _a.sent();
                    wake($);
                    return [2 /*return*/];
            }
        });
    });
}
// The facts changed: shows the base mood, unless something passing (a jump,
// a failure, the review) is on, which ends in the base mood by itself. A wait
// on the person is never held back.
function settle($) {
    return __awaiter(this, void 0, void 0, function () {
        var base;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    base = baseMood();
                    if (!(base !== target && (base === 'waiting' || isBase(target)))) return [3 /*break*/, 2];
                    return [4 /*yield*/, show($, base)];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    });
}
function runScript($, args) {
    return __awaiter(this, void 0, void 0, function () {
        var script, stored, shell, viaShell, known, _i, _a, command, ran, answer, _b;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    script = "".concat($.plugin.root, "/scripts/pet.mjs");
                    if (!(runner === undefined)) return [3 /*break*/, 2];
                    return [4 /*yield*/, $.store.get(STORE_RUNNER).catch(function () { return undefined; })];
                case 1:
                    stored = _d.sent();
                    runner = Array.isArray(stored) && stored.every(function (part) { return typeof part === 'string'; }) ? stored : undefined;
                    _d.label = 2;
                case 2: return [4 /*yield*/, $.env.get('SHELL').catch(function () { return undefined; })];
                case 3:
                    shell = _d.sent();
                    viaShell = shell === undefined || shell === '' || shell.endsWith('fish') ? [] : [[shell, '-lic', 'exec node "$0" "$@"']];
                    known = runner === undefined ? [] : [runner];
                    _i = 0, _a = __spreadArray(__spreadArray(__spreadArray([], known, true), RUNNERS, true), viaShell, true);
                    _d.label = 4;
                case 4:
                    if (!(_i < _a.length)) return [3 /*break*/, 11];
                    command = _a[_i];
                    _d.label = 5;
                case 5:
                    _d.trys.push([5, 9, , 10]);
                    return [4 /*yield*/, $.process.run(__spreadArray(__spreadArray(__spreadArray([], command, true), [script], false), args, true), {
                            timeoutMs: command.length > 1 ? SHELL_TIMEOUT_MS : SCRIPT_TIMEOUT_MS,
                        })];
                case 6:
                    ran = _d.sent();
                    answer = JSON.parse((_c = ran.stdout.trim().split('\n').pop()) !== null && _c !== void 0 ? _c : '');
                    if (!((runner === null || runner === void 0 ? void 0 : runner.join(' ')) !== command.join(' '))) return [3 /*break*/, 8];
                    runner = command;
                    return [4 /*yield*/, $.store.set(STORE_RUNNER, command).catch(function () { return undefined; })];
                case 7:
                    _d.sent();
                    _d.label = 8;
                case 8: return [2 /*return*/, answer];
                case 9:
                    _b = _d.sent();
                    return [3 /*break*/, 10];
                case 10:
                    _i++;
                    return [3 /*break*/, 4];
                case 11:
                    runner = undefined;
                    return [2 /*return*/, { error: 'Node.js was not found, and reading a Codex pet needs it' }];
            }
        });
    });
}
function readPet($, dir) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    _a = draw_1.petOf;
                    return [4 /*yield*/, $.fs.read("".concat(dir, "/meta.json"))];
                case 1: return [2 /*return*/, _a.apply(void 0, [_c.sent(), dir])];
                case 2:
                    _b = _c.sent();
                    return [2 /*return*/, undefined];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// Reads the mood's desktop frames once; a state that cannot be read is left
// empty, so the band draws the label alone rather than asking again.
function ensurePaths($, of) {
    return __awaiter(this, void 0, void 0, function () {
        var current, state, frames, parsed, _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    current = pet;
                    if (current === undefined) {
                        return [2 /*return*/];
                    }
                    state = (0, draw_1.stateOf)(current, of);
                    if (current.paths.has(state)) {
                        return [2 /*return*/];
                    }
                    frames = [];
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    _b = (_a = JSON).parse;
                    return [4 /*yield*/, $.fs.read("".concat(current.dir, "/svg-").concat(state, ".json"))];
                case 2:
                    parsed = _b.apply(_a, [_d.sent()]);
                    frames = Array.isArray(parsed) ? parsed.map(String) : [];
                    return [3 /*break*/, 4];
                case 3:
                    _c = _d.sent();
                    return [3 /*break*/, 4];
                case 4:
                    current.paths.set(state, frames);
                    return [2 /*return*/];
            }
        });
    });
}
// Loads the pet `wanted` names, converting it first when it is not cached.
// Answers what went wrong, if anything; with `orBundled`, a pet that cannot
// be loaded is replaced by the bundled one, and otherwise the current stays.
function loadPet($_1, wanted_1, _a) {
    return __awaiter(this, arguments, void 0, function ($, wanted, _b) {
        var built, converted, _c, problem, loaded, _d, _e;
        var _f;
        var orBundled = _b.orBundled, _g = _b.isForced, isForced = _g === void 0 ? false : _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0: return [4 /*yield*/, runScript($, __spreadArray(['build', wanted], (isForced ? ['--force'] : []), true))];
                case 1:
                    built = _h.sent();
                    if (!(built.dir === undefined)) return [3 /*break*/, 2];
                    _c = undefined;
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, readPet($, built.dir)];
                case 3:
                    _c = _h.sent();
                    _h.label = 4;
                case 4:
                    converted = _c;
                    problem = converted === undefined
                        ? ((_f = built.error) !== null && _f !== void 0 ? _f : 'the converted pet could not be read')
                        : built.skipped === undefined
                            ? undefined
                            : "skipped ".concat(built.skipped);
                    if (!(converted !== null && converted !== void 0)) return [3 /*break*/, 5];
                    _d = converted;
                    return [3 /*break*/, 9];
                case 5:
                    if (!orBundled) return [3 /*break*/, 7];
                    return [4 /*yield*/, readPet($, "".concat($.plugin.root, "/pets/blob/cache"))];
                case 6:
                    _e = _h.sent();
                    return [3 /*break*/, 8];
                case 7:
                    _e = undefined;
                    _h.label = 8;
                case 8:
                    _d = (_e);
                    _h.label = 9;
                case 9:
                    loaded = _d;
                    if (!(loaded !== undefined)) return [3 /*break*/, 13];
                    pet = loaded;
                    cells.clear();
                    ticks = 0;
                    frame = 0;
                    if (!(isOnDesktop !== false)) return [3 /*break*/, 11];
                    return [4 /*yield*/, ensurePaths($, target)];
                case 10:
                    _h.sent();
                    _h.label = 11;
                case 11: return [4 /*yield*/, (0, claude_code_1.update)($, loads, function (n) { return n + 1; })];
                case 12:
                    _h.sent();
                    wake($);
                    _h.label = 13;
                case 13: return [2 /*return*/, problem];
            }
        });
    });
}
// Whether the terminal the session runs in shows images: kitty and Ghostty
// do, by their own word in the environment. Not through tmux, which passes
// none on, nor over ssh, where the terminal cannot read this machine's files.
function detectImages($) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, term, program, kitty, ghostty, tmux, ssh, isCapable;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (settings.images !== 'auto') {
                        return [2 /*return*/, settings.images === 'on'];
                    }
                    return [4 /*yield*/, Promise.all([
                            $.env.get('TERM').catch(function () { return undefined; }),
                            $.env.get('TERM_PROGRAM').catch(function () { return undefined; }),
                            $.env.get('KITTY_WINDOW_ID').catch(function () { return undefined; }),
                            $.env.get('GHOSTTY_RESOURCES_DIR').catch(function () { return undefined; }),
                            $.env.get('TMUX').catch(function () { return undefined; }),
                            $.env.get('SSH_CONNECTION').catch(function () { return undefined; }),
                        ])];
                case 1:
                    _a = _b.sent(), term = _a[0], program = _a[1], kitty = _a[2], ghostty = _a[3], tmux = _a[4], ssh = _a[5];
                    isCapable = term === 'xterm-kitty' || term === 'xterm-ghostty' || program === 'ghostty' || !!kitty || !!ghostty;
                    return [2 /*return*/, isCapable && !tmux && !ssh];
            }
        });
    });
}
function chosenPet($) {
    return __awaiter(this, void 0, void 0, function () {
        var stored;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, $.store.get(STORE_PET).catch(function () { return undefined; })];
                case 1:
                    stored = _a.sent();
                    return [2 /*return*/, typeof stored === 'string' && stored !== '' ? stored : settings.pet];
            }
        });
    });
}
// Says a problem once, not at every session's start.
function report($, problem) {
    return __awaiter(this, void 0, void 0, function () {
        var last, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 6, , 7]);
                    return [4 /*yield*/, $.store.get(STORE_WARNED)];
                case 1:
                    last = _c.sent();
                    if (!(problem === undefined)) return [3 /*break*/, 4];
                    if (!(last !== undefined)) return [3 /*break*/, 3];
                    return [4 /*yield*/, $.store.delete(STORE_WARNED)];
                case 2:
                    _c.sent();
                    _c.label = 3;
                case 3: return [2 /*return*/];
                case 4:
                    if (last === problem) {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, $.store.set(STORE_WARNED, problem)];
                case 5:
                    _c.sent();
                    return [3 /*break*/, 7];
                case 6:
                    _a = _c.sent();
                    return [3 /*break*/, 7];
                case 7:
                    if (problem !== undefined) {
                        $.ui.toast("Codex Pet: ".concat(problem, ". Showing ").concat((_b = pet === null || pet === void 0 ? void 0 : pet.name) !== null && _b !== void 0 ? _b : 'no pet', "; /pet list names the pets found."), {
                            timeoutMs: 10000,
                        });
                    }
                    return [2 /*return*/];
            }
        });
    });
}
// The session's pet, loaded behind the session's start rather than in it:
// a first conversion, or a slow shell, holds nothing up.
function boot($) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _f.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, detectImages($)];
                case 1:
                    hasImages = _f.sent();
                    _a = report;
                    _b = [$];
                    _c = loadPet;
                    _d = [$];
                    return [4 /*yield*/, chosenPet($)];
                case 2: return [4 /*yield*/, _c.apply(void 0, _d.concat([_f.sent(), { orBundled: true }]))];
                case 3: return [4 /*yield*/, _a.apply(void 0, _b.concat([_f.sent()]))];
                case 4:
                    _f.sent();
                    return [3 /*break*/, 6];
                case 5:
                    _e = _f.sent();
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function paint($, current) {
    return __awaiter(this, void 0, void 0, function () {
        var answer, key, packed;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!(isOnDesktop === true)) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, claude_code_1.update)($, step, function (n) { return (n + 1) % 1000000; })];
                case 1:
                    _b.sent();
                    return [3 /*break*/, 8];
                case 2:
                    if (!(bandId !== undefined && isImageDrawn)) return [3 /*break*/, 6];
                    return [4 /*yield*/, $.ui.blit({ requestId: bandId, key: 'pet', source: (0, draw_1.imageOf)(current, target, frame) })];
                case 3:
                    answer = _b.sent();
                    isImageUnproven = false;
                    if (!(answer.deny !== undefined)) return [3 /*break*/, 5];
                    hasImages = false;
                    return [4 /*yield*/, (0, claude_code_1.update)($, loads, function (n) { return n + 1; })];
                case 4:
                    _b.sent();
                    _b.label = 5;
                case 5: return [3 /*break*/, 8];
                case 6:
                    if (!(bandId !== undefined)) return [3 /*break*/, 8];
                    key = "".concat(terminalSize, ":").concat(target, ":").concat(frame);
                    packed = (_a = cells.get(key)) !== null && _a !== void 0 ? _a : (0, draw_1.cellsOf)(current, terminalSize, target, frame);
                    cells.set(key, packed);
                    return [4 /*yield*/, $.ui.blit({ requestId: bandId, key: 'pet', cells: packed })];
                case 7:
                    _b.sent();
                    _b.label = 8;
                case 8: return [2 /*return*/];
            }
        });
    });
}
// One period of the frame timer. Answers how long until the next.
function advance($) {
    return __awaiter(this, void 0, void 0, function () {
        var tool, current, count, due;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!(started.length > 0)) return [3 /*break*/, 3];
                    tool = calls.get((_a = started.shift()) !== null && _a !== void 0 ? _a : '');
                    if (!(tool !== undefined && removeOne(permissions, tool))) return [3 /*break*/, 2];
                    return [4 /*yield*/, settle($)];
                case 1:
                    _b.sent();
                    _b.label = 2;
                case 2: return [3 /*break*/, 0];
                case 3:
                    current = pet;
                    if (current === undefined || (isOnDesktop !== true && bandId === undefined)) {
                        return [2 /*return*/, REST_MS];
                    }
                    if (!(isOnDesktop === true && !current.paths.has((0, draw_1.stateOf)(current, target)))) return [3 /*break*/, 6];
                    return [4 /*yield*/, ensurePaths($, target)];
                case 4:
                    _b.sent();
                    return [4 /*yield*/, paint($, current)];
                case 5:
                    _b.sent();
                    return [2 /*return*/, FRAME_MS];
                case 6:
                    if (!(isImageDrawn && isImageUnproven)) return [3 /*break*/, 8];
                    return [4 /*yield*/, paint($, current)];
                case 7:
                    _b.sent();
                    _b.label = 8;
                case 8:
                    count = (0, draw_1.frameCount)(current, target);
                    if (settings.animation === 'still' || count <= 1) {
                        return [2 /*return*/, REST_MS];
                    }
                    // calm: once through, then the first frame held a while
                    if (settings.animation === 'calm' && CALM_MOODS.has(target) && ticks >= count) {
                        restedMs += REST_MS;
                        if (restedMs >= CALM_REST_MS) {
                            ticks = 0;
                            restedMs = 0;
                        }
                        return [2 /*return*/, REST_MS];
                    }
                    ticks += 1;
                    due = ticks % count;
                    if (!(due !== frame)) return [3 /*break*/, 10];
                    frame = due;
                    return [4 /*yield*/, paint($, current)];
                case 9:
                    _b.sent();
                    _b.label = 10;
                case 10: return [2 /*return*/, FRAME_MS];
            }
        });
    });
}
function tick($) {
    return __awaiter(this, void 0, void 0, function () {
        var delay, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    // this period's timer has fired: whoever finishes arms the next
                    timer = undefined;
                    if (isTicking) {
                        return [2 /*return*/];
                    }
                    isTicking = true;
                    delay = REST_MS;
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, 4, 5]);
                    return [4 /*yield*/, advance($)];
                case 2:
                    delay = _b.sent();
                    return [3 /*break*/, 5];
                case 3:
                    _a = _b.sent();
                    return [3 /*break*/, 5];
                case 4:
                    isTicking = false;
                    return [7 /*endfinally*/];
                case 5:
                    // unless a change woke the timer meanwhile
                    if (timer === undefined) {
                        wake($, delay);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function listPets($) {
    return __awaiter(this, void 0, void 0, function () {
        var answer, rows;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, runScript($, ['list'])];
                case 1:
                    answer = _c.sent();
                    if (answer.pets === undefined) {
                        return [2 /*return*/, "Could not list pets: ".concat((_a = answer.error) !== null && _a !== void 0 ? _a : 'the script printed nothing', ".")];
                    }
                    rows = answer.pets.map(function (one) {
                        var _a;
                        var mark = one.id === (pet === null || pet === void 0 ? void 0 : pet.id) ? '>' : ' ';
                        return "".concat(mark, " ").concat(one.id.padEnd(16), " ").concat(one.name.padEnd(24), " ").concat((_a = SOURCE[one.source]) !== null && _a !== void 0 ? _a : one.source);
                    });
                    // fenced: a command's text is drawn as markdown, which would reflow the columns
                    return [2 /*return*/, __spreadArray(__spreadArray([
                            'Pets found (`>` is showing). `/pet use <id>` switches; `/pet use auto` follows the setting.',
                            '```'
                        ], rows, true), [
                            '```',
                            "auto would pick: ".concat((_b = answer.auto) !== null && _b !== void 0 ? _b : 'none'),
                        ], false).join('\n')];
            }
        });
    });
}
function showing(problem, isKept) {
    var _a;
    if (isKept === void 0) { isKept = false; }
    var name = (_a = pet === null || pet === void 0 ? void 0 : pet.name) !== null && _a !== void 0 ? _a : 'no pet';
    return problem === undefined ? "Showing ".concat(name, ".") : "".concat(problem, ". ").concat(isKept ? 'Still showing' : 'Showing', " ").concat(name, ".");
}
function usePet($, wanted) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, problem;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (wanted.startsWith('-')) {
                        return [2 /*return*/, usage()];
                    }
                    if (!(wanted === 'auto')) return [3 /*break*/, 3];
                    return [4 /*yield*/, $.store.delete(STORE_PET).catch(function () { return undefined; })];
                case 1:
                    _c.sent();
                    _a = showing;
                    return [4 /*yield*/, loadPet($, settings.pet, { orBundled: true })];
                case 2: return [2 /*return*/, _a.apply(void 0, [_c.sent()])];
                case 3: return [4 /*yield*/, loadPet($, wanted, { orBundled: false })];
                case 4:
                    problem = _c.sent();
                    if (problem !== undefined) {
                        return [2 /*return*/, showing(problem, true)];
                    }
                    // the id as the script knows it, whatever case it was typed in
                    return [4 /*yield*/, $.store.set(STORE_PET, (_b = pet === null || pet === void 0 ? void 0 : pet.id) !== null && _b !== void 0 ? _b : wanted).catch(function () { return undefined; })];
                case 5:
                    // the id as the script knows it, whatever case it was typed in
                    _c.sent();
                    return [2 /*return*/, showing(undefined)];
            }
        });
    });
}
function usage() {
    var _a;
    var now = pet === undefined ? 'No pet is loaded.' : "Showing ".concat(pet.name, " (").concat((_a = SOURCE[pet.source]) !== null && _a !== void 0 ? _a : pet.source, "): ").concat(draw_1.LABEL[target]);
    return [
        now,
        '',
        'Usage: `/pet list` | `use <id|auto>` | `refresh` | `hide` | `show` | `<mood>`',
        '',
        "Moods to preview: ".concat(draw_1.MOODS.join(', ')),
    ].join('\n');
}
var register = function (on, options) {
    settings = {
        pet: typeof options.pet === 'string' && options.pet !== '' ? options.pet : 'auto',
        size: options.size === 'small' || options.size === 'large' ? options.size : 'medium',
        animation: options.animation === 'lively' || options.animation === 'still' ? options.animation : 'calm',
        hasLabel: options.label !== false,
        images: options.terminalImages === 'on' || options.terminalImages === 'off' ? options.terminalImages : 'auto',
        align: options.align === 'center' || options.align === 'right' ? options.align : 'left',
    };
    on('session.start', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, $.command.register({
                        name: 'pet',
                        description: 'Your Codex pet: /pet list | use <id|auto> | refresh | hide | show | <mood>',
                    })];
                case 1:
                    _a.sent();
                    void boot($);
                    void show($, 'waving', FLASH_MS);
                    return [2 /*return*/, next(e)];
            }
        });
    }); });
    on('turn.start', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    isTurnRunning = true;
                    // nothing of the last turn is still asked of the person
                    questions.clear();
                    permissions.length = 0;
                    refused.length = 0;
                    elicitations = 0;
                    return [4 /*yield*/, show($, 'running')];
                case 1:
                    _a.sent();
                    return [2 /*return*/, next(e)];
            }
        });
    }); });
    on('turn.complete', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(e.agentId !== undefined)) return [3 /*break*/, 3];
                    if (!(agentsInFlight > 0)) return [3 /*break*/, 2];
                    agentsInFlight -= 1;
                    return [4 /*yield*/, settle($)];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/, next(e)];
                case 3:
                    isTurnRunning = false;
                    questions.clear();
                    permissions.length = 0;
                    elicitations = 0;
                    if (!(e.reason === 'aborted')) return [3 /*break*/, 5];
                    return [4 /*yield*/, show($, baseMood())];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 11];
                case 5:
                    if (!(e.reason !== 'answer')) return [3 /*break*/, 7];
                    return [4 /*yield*/, show($, 'failed', FAILED_MS)];
                case 6:
                    _a.sent();
                    return [3 /*break*/, 11];
                case 7:
                    if (!(agentsInFlight > 0)) return [3 /*break*/, 9];
                    return [4 /*yield*/, show($, 'running')];
                case 8:
                    _a.sent();
                    return [3 /*break*/, 11];
                case 9: return [4 /*yield*/, show($, 'jumping', JUMP_MS, 'review')];
                case 10:
                    _a.sent();
                    _a.label = 11;
                case 11: return [2 /*return*/, next(e)];
            }
        });
    }); });
    // The main loop's stop says what is still in flight behind it; it may come
    // before or after turn.complete, so both settle on the same count. Agents
    // count, shells do not: a dev server left running is not the pet at work.
    on('classic.Stop', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    agentsInFlight = ((_a = e.background_tasks) !== null && _a !== void 0 ? _a : []).filter(function (task) { return task.agent_type !== undefined || /agent/i.test(task.type); }).length;
                    agentsCap === null || agentsCap === void 0 ? void 0 : agentsCap.cancel();
                    agentsCap = undefined;
                    if (!(agentsInFlight > 0)) return [3 /*break*/, 2];
                    agentsCap = $.clock.after(AGENTS_CAP_MS, function () {
                        agentsInFlight = 0;
                        void settle($);
                    });
                    if (!(!isTurnRunning && target !== 'failed')) return [3 /*break*/, 2];
                    return [4 /*yield*/, show($, 'running')];
                case 1:
                    _b.sent();
                    _b.label = 2;
                case 2: return [2 /*return*/, next(e)];
            }
        });
    }); }).catch(function ($, e, next) { return next(e); });
    on('classic.PermissionRequest', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    permissions.push(e.tool_name);
                    return [4 /*yield*/, settle($)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, next(e)];
            }
        });
    }); }).catch(function ($, e, next) { return next(e); });
    on('classic.PermissionDenied', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    removeOne(permissions, e.tool_name);
                    refused.push(e.tool_name);
                    return [4 /*yield*/, settle($)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, next(e)];
            }
        });
    }); }).catch(function ($, e, next) { return next(e); });
    on('classic.Elicitation', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    elicitations += 1;
                    return [4 /*yield*/, settle($)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, next(e)];
            }
        });
    }); }).catch(function ($, e, next) { return next(e); });
    on('classic.ElicitationResult', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    elicitations = Math.max(0, elicitations - 1);
                    return [4 /*yield*/, settle($)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, next(e)];
            }
        });
    }); }).catch(function ($, e, next) { return next(e); });
    on('tool.call', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var tool, id, isQuestion, ran, wasRefused, hasFailed, isWorthShowing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    tool = String(e.tool);
                    id = e.tool_use_id;
                    isQuestion = tool === 'AskUserQuestion' || tool === 'ExitPlanMode';
                    calls.set(id, tool);
                    if (!isQuestion) return [3 /*break*/, 2];
                    questions.add(id);
                    return [4 /*yield*/, settle($)];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [4 /*yield*/, next(e)
                    // this call is over, and with it whatever of it waited on the person
                ];
                case 3:
                    ran = _a.sent();
                    // this call is over, and with it whatever of it waited on the person
                    calls.delete(id);
                    pilled.delete(id);
                    questions.delete(id);
                    removeOne(permissions, tool);
                    wasRefused = removeOne(refused, tool);
                    hasFailed = ran.deny === undefined && ran.isError === true;
                    isWorthShowing = !wasRefused && (isTurnRunning || e.agentId !== undefined) && baseMood() !== 'waiting';
                    if (!(hasFailed && isWorthShowing)) return [3 /*break*/, 5];
                    return [4 /*yield*/, show($, 'failed', FLASH_MS)];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 7];
                case 5: return [4 /*yield*/, settle($)];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7: return [2 /*return*/, ran];
            }
        });
    }); }).catch(function ($, e, next) { return next(e); });
    on('command.run', { command: 'pet' }, function ($, e) { return __awaiter(void 0, void 0, void 0, function () {
        var _a, _b, verb, rest, arg, _c, _d, _e;
        var _f, _g, _h;
        var _j, _k;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    _a = e.args.trim().split(/\s+/), _b = _a[0], verb = _b === void 0 ? '' : _b, rest = _a.slice(1);
                    arg = rest.join(' ');
                    if (!(verb === 'list')) return [3 /*break*/, 2];
                    _f = {};
                    return [4 /*yield*/, listPets($)];
                case 1: return [2 /*return*/, (_f.text = _l.sent(), _f)];
                case 2:
                    if (!(verb === 'use' && arg !== '')) return [3 /*break*/, 4];
                    _g = {};
                    return [4 /*yield*/, usePet($, arg)];
                case 3: return [2 /*return*/, (_g.text = _l.sent(), _g)];
                case 4:
                    if (!(verb === 'refresh')) return [3 /*break*/, 7];
                    _h = {};
                    _c = showing;
                    _d = loadPet;
                    _e = [$];
                    return [4 /*yield*/, chosenPet($)];
                case 5: return [4 /*yield*/, _d.apply(void 0, _e.concat([_l.sent(), { orBundled: true, isForced: true }]))];
                case 6: return [2 /*return*/, (_h.text = _c.apply(void 0, [_l.sent()]), _h)];
                case 7:
                    if (!(verb === 'hide' || verb === 'show')) return [3 /*break*/, 9];
                    return [4 /*yield*/, (0, claude_code_1.update)($, isHidden, function () { return verb === 'hide'; })];
                case 8:
                    _l.sent();
                    wake($);
                    return [2 /*return*/, { text: "".concat((_j = pet === null || pet === void 0 ? void 0 : pet.name) !== null && _j !== void 0 ? _j : 'The pet', " is ").concat(verb === 'hide' ? 'hidden; /pet show brings it back' : 'back', ".") }];
                case 9:
                    if (!(0, draw_1.isMood)(verb)) return [3 /*break*/, 12];
                    return [4 /*yield*/, (0, claude_code_1.update)($, isHidden, function () { return false; })];
                case 10:
                    _l.sent();
                    return [4 /*yield*/, show($, verb, 6000)];
                case 11:
                    _l.sent();
                    return [2 /*return*/, { text: "".concat((_k = pet === null || pet === void 0 ? void 0 : pet.name) !== null && _k !== void 0 ? _k : 'The pet', ": ").concat(verb) }];
                case 12: return [2 /*return*/, { text: usage() }];
            }
        });
    }); });
    // Approving a permission dialog raises no event of its own. On the terminal
    // a long call then draws its pill, which says that call is running: the one
    // sign there is, and only there (the desktop raises no ToolProgress).
    on('ui.render', { component: 'ToolProgress' }, function ($, e, next) {
        var id = e.props.tool_use_id;
        if (calls.has(id) && !pilled.has(id)) {
            pilled.add(id);
            started.push(id);
        }
        return next(e);
    });
    on('ui.render', { component: 'AbovePrompt' }, function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var _a, now, hidden, current, label, justify, _b, Box, Image_1, Raster, Text_1, beside, imageRows, columns, rowsOf_1, fits, size, _c, Box, Svg, Text_2, source, height;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, Promise.all([(0, claude_code_1.read)($, mood), (0, claude_code_1.read)($, isHidden), (0, claude_code_1.read)($, step), (0, claude_code_1.read)($, loads)])];
                case 1:
                    _a = _d.sent(), now = _a[0], hidden = _a[1];
                    current = pet;
                    if (hidden || e.props.hasSurvey || current === undefined) {
                        bandId = undefined;
                        isOnDesktop = undefined;
                        return [2 /*return*/, next(e)];
                    }
                    isOnDesktop = e.surface === 'desktop';
                    label = "".concat(current.name, ": ").concat(draw_1.LABEL[now]);
                    justify = JUSTIFY[settings.align];
                    if (e.surface === 'terminal') {
                        _b = $.ui.resolve(e), Box = _b.Box, Image_1 = _b.Image, Raster = _b.Raster, Text_1 = _b.Text;
                        beside = settings.hasLabel && (<Box flexDirection="column" justifyContent="flex-end" marginLeft={1}>
          <Text_1 bold>{current.name}</Text_1>
          <Text_1 dimColor>{draw_1.LABEL[now]}</Text_1>
        </Box>);
                        imageRows = Math.min(IMAGE_ROWS[settings.size], e.props.maxRows);
                        if (hasImages && imageRows >= IMAGE_MIN_ROWS) {
                            columns = Math.max(1, Math.round((imageRows * 2 * current.png.width) / current.png.height));
                            isImageUnproven || (isImageUnproven = !isImageDrawn || bandId !== e.requestId);
                            bandId = e.requestId;
                            isImageDrawn = true;
                            return [2 /*return*/, (<Box width="100%" justifyContent={justify}>
            <Image_1 key="pet" source={(0, draw_1.imageOf)(current, now, frame)} columns={columns} rows={imageRows} alt={label}/>
            {beside}
          </Box>)];
                        }
                        isImageDrawn = false;
                        rowsOf_1 = function (size) { return Math.ceil(current[size].height / 2); };
                        fits = function (size) { return e.props.maxRows >= rowsOf_1(size); };
                        size = settings.size !== 'small' && fits('lo') ? 'lo' : fits('tiny') ? 'tiny' : undefined;
                        if (size === undefined) {
                            bandId = undefined;
                            return [2 /*return*/, settings.hasLabel ? <Text_1 dimColor>{label}</Text_1> : next(e)];
                        }
                        bandId = e.requestId;
                        terminalSize = size;
                        return [2 /*return*/, (<Box width="100%" justifyContent={justify}>
          <Raster key="pet" columns={current[size].width} rows={rowsOf_1(size)} cells={(0, draw_1.cellsOf)(current, size, now, frame)}/>
          {beside}
        </Box>)];
                    }
                    if (e.surface === 'desktop') {
                        _c = $.ui.resolve(e), Box = _c.Box, Svg = _c.Svg, Text_2 = _c.Text;
                        source = (0, draw_1.svgOf)(current, now, frame);
                        height = DESKTOP_HEIGHT[settings.size];
                        // this mood's frames are not read yet: the timer reads them and redraws
                        if (source === undefined) {
                            return [2 /*return*/, settings.hasLabel ? <Text_2 dimColor>{label}</Text_2> : next(e)];
                        }
                        return [2 /*return*/, (<Box width="100%" justifyContent={justify}>
          <Svg source={source} alt={label} width={Math.round((height * current.svg.width) / current.svg.height)} height={height}/>
          {settings.hasLabel && (<Box flexDirection="column" justifyContent="flex-end" marginLeft={1}>
              <Text_2 bold>{current.name}</Text_2>
              <Text_2 dimColor>{draw_1.LABEL[now]}</Text_2>
            </Box>)}
        </Box>)];
                    }
                    return [2 /*return*/, next(e)];
            }
        });
    }); });
};
exports.register = register;
