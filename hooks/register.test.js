"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
Object.defineProperty(exports, "__esModule", { value: true });
var testing_1 = require("claude-code/testing");
var BAND = {
    plugin: 'codex-pet',
    component: 'AbovePrompt',
    props: {
        hasSurvey: false,
        isWorking: false,
        maxRows: 20,
        bodyColumns: 80,
        scroll: { offset: 0, bodyRows: 20 },
        view: {},
    },
};
var STATES = ['idle', 'running-right', 'running-left', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review'];
// A converted pet as scripts/pet.mjs writes one: 2x2 pixels, two idle frames.
function converted(id, name) {
    var frames = function (state) { return (state === 'idle' ? ['0.0.', '.0.0'] : ['0000']); };
    var files = {
        'meta.json': JSON.stringify({
            version: 6,
            id: id,
            name: name,
            source: id === 'blob' ? 'bundled' : 'installed',
            lo: {
                width: 2,
                height: 2,
                palette: ['#ff0000'],
                states: Object.fromEntries(STATES.map(function (state) { return [state, frames(state)]; })),
            },
            tiny: {
                width: 1,
                height: 1,
                states: Object.fromEntries(STATES.map(function (state) { return [state, frames(state).map(function () { return '0'; })]; })),
            },
            png: { width: 192, height: 208 },
            svg: {
                width: 2,
                height: 2,
                colors: 1,
                frames: Object.fromEntries(STATES.map(function (state) { return [state, frames(state).length]; })),
            },
        }),
    };
    var _loop_1 = function (state) {
        files["svg-".concat(state, ".json")] = JSON.stringify(frames(state).map(function (_, at) { return "<path stroke=\"#ff0000\" d=\"M".concat(at, " 0h1\"/><!--").concat(id, " ").concat(state, " ").concat(at, "-->"); }));
    };
    for (var _i = 0, STATES_1 = STATES; _i < STATES_1.length; _i++) {
        var state = STATES_1[_i];
        _loop_1(state);
    }
    return files;
}
var PETS = {
    tiny: converted('tiny', 'Tiny'),
    other: converted('other', 'Other'),
};
var BLOB = converted('blob', 'Blob');
// The world beneath the plugin: a clock, a store, the host's script and files.
function world(on, _a) {
    var _this = this;
    var _b = _a === void 0 ? {} : _a, _c = _b.hasNode, hasNode = _c === void 0 ? true : _c, _d = _b.env, env = _d === void 0 ? undefined : _d, _e = _b.blit, blit = _e === void 0 ? undefined : _e;
    var clock = testing_1.mock.clock(on);
    var toasts = [];
    var runs = [];
    testing_1.mock.store(on);
    if (env !== undefined) {
        testing_1.mock.env(on, env);
    }
    // the terminal's answer to a repaint: taken, or refused with `blit`
    var repaints = [];
    on('ui.blit', function (_, e) {
        repaints.push(e);
        return { value: blit === undefined ? {} : { deny: blit } };
    });
    on('command.register', function () { return ({ value: undefined }); });
    on('session.start', function (_, e) { return e; });
    on('turn.start', function (_, e) { return ({ turnId: e.turnId }); });
    on('turn.complete', function () { return ({ text: '' }); });
    on('ui.toast', function (_, e) {
        var _a;
        toasts.push(String((_a = e.text) !== null && _a !== void 0 ? _a : e));
        return { value: undefined };
    });
    on('process.run', function (_, e) {
        if (!hasNode) {
            throw new Error('spawn ENOENT');
        }
        runs.push(e.argv.slice(2));
        var _a = e.argv.slice(2), verb = _a[0], _b = _a[1], wanted = _b === void 0 ? 'auto' : _b;
        var id = wanted === 'auto' ? 'tiny' : wanted;
        var answer = verb === 'list'
            ? { pets: [{ id: 'tiny', name: 'Tiny', source: 'installed' }], auto: 'tiny' }
            : PETS[id] === undefined
                ? { error: "no pet named \"".concat(id, "\"") }
                : { dir: "/cache/".concat(id), id: id };
        return {
            value: {
                exitCode: 'error' in answer ? 1 : 0,
                stdout: JSON.stringify(answer) + '\n',
                stderr: '',
                isStdoutTruncated: false,
                isStderrTruncated: false,
            },
        };
    });
    on('fs.read', function (_, e) {
        var _a, _b;
        var name = (_a = e.path.split('/').pop()) !== null && _a !== void 0 ? _a : '';
        var cached = /^\/cache\/([^/]+)\//.exec(e.path);
        var files = cached ? PETS[(_b = cached[1]) !== null && _b !== void 0 ? _b : ''] : e.path.includes('/pets/blob/cache/') ? BLOB : undefined;
        var text = files === null || files === void 0 ? void 0 : files[name];
        if (text === undefined) {
            throw new Error('ENOENT');
        }
        return { value: text };
    });
    // the pet loads behind the session's start: let that finish
    var start = function ($) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, $.session.start({ cwd: '/tmp' })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, clock.advance(0)];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); };
    return { clock: clock, toasts: toasts, runs: runs, repaints: repaints, start: start };
}
function labelOn($) {
    return __awaiter(this, void 0, void 0, function () {
        var ui, label;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'terminal' }))];
                case 1:
                    ui = _b.sent();
                    return [4 /*yield*/, ui.find({ type: 'Text', text: /idle|working|review|done|failed|needs you|hi!/ })];
                case 2:
                    label = (_a = (_b.sent())) === null || _a === void 0 ? void 0 : _a.text;
                    return [4 /*yield*/, ui.unmount()];
                case 3:
                    _b.sent();
                    return [2 /*return*/, label];
            }
        });
    });
}
function sourceOn($) {
    return __awaiter(this, void 0, void 0, function () {
        var ui, svg;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'desktop' }))];
                case 1:
                    ui = _a.sent();
                    return [4 /*yield*/, ui.find({ type: 'Svg' })];
                case 2:
                    svg = _a.sent();
                    return [4 /*yield*/, ui.unmount()];
                case 3:
                    _a.sent();
                    return [2 /*return*/, svg === undefined ? undefined : String(svg.props.source)];
            }
        });
    });
}
(0, testing_1.test)('the terminal band draws the loaded pet as a Raster of half blocks', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var start, ui, pet, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                start = world(on).start;
                return [4 /*yield*/, start($)];
            case 1:
                _b.sent();
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'terminal' }))];
            case 2:
                ui = _b.sent();
                return [4 /*yield*/, ui.find({ type: 'Raster', key: 'pet' })];
            case 3:
                pet = _b.sent();
                (0, testing_1.expect)(pet === null || pet === void 0 ? void 0 : pet.props.columns).toBe(2);
                (0, testing_1.expect)(pet === null || pet === void 0 ? void 0 : pet.props.rows).toBe(1);
                _a = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: 'Tiny' })];
            case 4:
                _a.apply(void 0, [_b.sent()]).toBeDefined();
                return [4 /*yield*/, ui.unmount()];
            case 5:
                _b.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('a short terminal, or the small size, gets the half-size pet; a shorter one the label', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var start, drawn, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                start = world(on).start;
                return [4 /*yield*/, start($)];
            case 1:
                _c.sent();
                drawn = function (maxRows) { return __awaiter(void 0, void 0, void 0, function () {
                    var ui, pet, label;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { props: __assign(__assign({}, BAND.props), { maxRows: maxRows }), surface: 'terminal' }))];
                            case 1:
                                ui = _a.sent();
                                return [4 /*yield*/, ui.find({ type: 'Raster', key: 'pet' })];
                            case 2:
                                pet = _a.sent();
                                return [4 /*yield*/, ui.find({ type: 'Text', text: /Tiny: / })];
                            case 3:
                                label = _a.sent();
                                return [4 /*yield*/, ui.unmount()];
                            case 4:
                                _a.sent();
                                return [2 /*return*/, pet === undefined ? (label === undefined ? 'nothing' : 'label') : "".concat(pet.props.columns, "x").concat(pet.props.rows)];
                        }
                    });
                }); };
                // the fixture's full size is 2 columns by 1 row, its half size 1 by 1
                _a = testing_1.expect;
                return [4 /*yield*/, drawn(1)];
            case 2:
                // the fixture's full size is 2 columns by 1 row, its half size 1 by 1
                _a.apply(void 0, [_c.sent()]).toBe('2x1');
                _b = testing_1.expect;
                return [4 /*yield*/, drawn(0)];
            case 3:
                _b.apply(void 0, [_c.sent()]).toBe('label');
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('a terminal that shows images gets the pet as a picture, in fewer rows', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, clock, repaints, start, ui, picture, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _a = world(on, { env: { TERM: 'xterm-kitty' } }), clock = _a.clock, repaints = _a.repaints, start = _a.start;
                return [4 /*yield*/, start($)];
            case 1:
                _c.sent();
                return [4 /*yield*/, clock.advance(2500)];
            case 2:
                _c.sent();
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'terminal' }))];
            case 3:
                ui = _c.sent();
                return [4 /*yield*/, ui.find({ type: 'Image', key: 'pet' })];
            case 4:
                picture = _c.sent();
                (0, testing_1.expect)(picture === null || picture === void 0 ? void 0 : picture.props.source).toEqual({ file: '/cache/tiny/png-idle-0.png', format: 'png' });
                (0, testing_1.expect)(picture === null || picture === void 0 ? void 0 : picture.props.rows).toBe(6);
                (0, testing_1.expect)(picture === null || picture === void 0 ? void 0 : picture.props.columns).toBe(11);
                _b = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Raster' })];
            case 5:
                _b.apply(void 0, [_c.sent()]).toBeUndefined();
                // the frames after it are swapped in by name, no pixel passing through
                return [4 /*yield*/, clock.advance(160)];
            case 6:
                // the frames after it are swapped in by name, no pixel passing through
                _c.sent();
                (0, testing_1.expect)(repaints.at(-1)).toMatchObject({ key: 'pet', source: { file: '/cache/tiny/png-idle-1.png', format: 'png' } });
                return [4 /*yield*/, ui.unmount()];
            case 7:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('a terminal that turns out not to show the picture gets half blocks instead', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, clock, start, ui, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                _a = world(on, { env: { TERM: 'xterm-kitty' }, blit: 'the Image draws its alt here' }), clock = _a.clock, start = _a.start;
                return [4 /*yield*/, start($)];
            case 1:
                _e.sent();
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'terminal' }))];
            case 2:
                ui = _e.sent();
                _b = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Image' })];
            case 3:
                _b.apply(void 0, [_e.sent()]).toBeDefined();
                return [4 /*yield*/, clock.advance(1160)];
            case 4:
                _e.sent();
                _c = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Image' })];
            case 5:
                _c.apply(void 0, [_e.sent()]).toBeUndefined();
                _d = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Raster', key: 'pet' })];
            case 6:
                _d.apply(void 0, [_e.sent()]).toBeDefined();
                return [4 /*yield*/, ui.unmount()];
            case 7:
                _e.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('no picture through tmux, over ssh, or when switched off', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var start, ui, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                start = world(on, { env: { TERM: 'xterm-kitty', TMUX: '/tmp/tmux-1/default,1,0' } }).start;
                return [4 /*yield*/, start($)];
            case 1:
                _c.sent();
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'terminal' }))];
            case 2:
                ui = _c.sent();
                _a = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Image' })];
            case 3:
                _a.apply(void 0, [_c.sent()]).toBeUndefined();
                _b = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Raster', key: 'pet' })];
            case 4:
                _b.apply(void 0, [_c.sent()]).toBeDefined();
                return [4 /*yield*/, ui.unmount()];
            case 5:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('the desktop band draws one frame as a plain image and steps to the next', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, clock, start, ui, first, second;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = world(on), clock = _a.clock, start = _a.start;
                return [4 /*yield*/, start($)];
            case 1:
                _b.sent();
                return [4 /*yield*/, clock.advance(2500)]; // the wave at the start is over: idle
            case 2:
                _b.sent(); // the wave at the start is over: idle
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'desktop' }))];
            case 3:
                ui = _b.sent();
                return [4 /*yield*/, ui.find({ type: 'Svg' })];
            case 4:
                first = _b.sent();
                (0, testing_1.expect)(String(first === null || first === void 0 ? void 0 : first.props.source)).toContain('viewBox="0 0 2 2"');
                (0, testing_1.expect)(String(first === null || first === void 0 ? void 0 : first.props.source)).toContain('tiny idle 0');
                (0, testing_1.expect)(first === null || first === void 0 ? void 0 : first.props.isInteractive).toBeUndefined();
                (0, testing_1.expect)(first === null || first === void 0 ? void 0 : first.props.height).toBe(104);
                return [4 /*yield*/, clock.advance(160)];
            case 5:
                _b.sent();
                return [4 /*yield*/, ui.find({ type: 'Svg' })];
            case 6:
                second = _b.sent();
                (0, testing_1.expect)(String(second === null || second === void 0 ? void 0 : second.props.source)).toContain('tiny idle 1');
                return [4 /*yield*/, ui.unmount()];
            case 7:
                _b.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('calm: an idle pet plays through, then rests without redrawing', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, clock, start, ui, resting, _b, at, _c, _d;
    var _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                _a = world(on), clock = _a.clock, start = _a.start;
                return [4 /*yield*/, start($)];
            case 1:
                _g.sent();
                return [4 /*yield*/, clock.advance(2500)];
            case 2:
                _g.sent();
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'desktop' }))];
            case 3:
                ui = _g.sent();
                return [4 /*yield*/, clock.advance(160 * 6)]; // past its two frames, into the rest
            case 4:
                _g.sent(); // past its two frames, into the rest
                _b = String;
                return [4 /*yield*/, ui.find({ type: 'Svg' })];
            case 5:
                resting = _b.apply(void 0, [(_e = (_g.sent())) === null || _e === void 0 ? void 0 : _e.props.source]);
                (0, testing_1.expect)(resting).toContain('tiny idle 0');
                at = 0;
                _g.label = 6;
            case 6:
                if (!(at < 10)) return [3 /*break*/, 10];
                return [4 /*yield*/, clock.advance(160)];
            case 7:
                _g.sent();
                _c = testing_1.expect;
                _d = String;
                return [4 /*yield*/, ui.find({ type: 'Svg' })];
            case 8:
                _c.apply(void 0, [_d.apply(void 0, [(_f = (_g.sent())) === null || _f === void 0 ? void 0 : _f.props.source])]).toBe(resting);
                _g.label = 9;
            case 9:
                at += 1;
                return [3 /*break*/, 6];
            case 10: return [4 /*yield*/, ui.unmount()];
            case 11:
                _g.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('options: the pet stands where the setting says', { options: { align: 'center' } }, function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var start, _i, _a, surface, ui, row;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                start = world(on).start;
                return [4 /*yield*/, start($)];
            case 1:
                _b.sent();
                _i = 0, _a = ['terminal', 'desktop'];
                _b.label = 2;
            case 2:
                if (!(_i < _a.length)) return [3 /*break*/, 7];
                surface = _a[_i];
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: surface }))];
            case 3:
                ui = _b.sent();
                return [4 /*yield*/, ui.find({ type: 'Box' })];
            case 4:
                row = _b.sent();
                (0, testing_1.expect)(row === null || row === void 0 ? void 0 : row.props.justifyContent).toBe('center');
                (0, testing_1.expect)(row === null || row === void 0 ? void 0 : row.props.width).toBe('100%');
                return [4 /*yield*/, ui.unmount()];
            case 5:
                _b.sent();
                _b.label = 6;
            case 6:
                _i++;
                return [3 /*break*/, 2];
            case 7: return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('options: no label, and a larger pet', { options: { label: false, size: 'large' } }, function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, clock, start, ui, _b, _c;
    var _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                _a = world(on), clock = _a.clock, start = _a.start;
                return [4 /*yield*/, start($)];
            case 1:
                _e.sent();
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'desktop' }))];
            case 2:
                ui = _e.sent();
                return [4 /*yield*/, clock.advance(320)];
            case 3:
                _e.sent();
                _b = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Svg' })];
            case 4:
                _b.apply(void 0, [(_d = (_e.sent())) === null || _d === void 0 ? void 0 : _d.props.height]).toBe(156);
                _c = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text' })];
            case 5:
                _c.apply(void 0, [_e.sent()]).toBeUndefined();
                return [4 /*yield*/, ui.unmount()];
            case 6:
                _e.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('without Node the bundled pet is shown, and the reason said once', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, toasts, start, ui, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _a = world(on, { hasNode: false }), toasts = _a.toasts, start = _a.start;
                return [4 /*yield*/, start($)];
            case 1:
                _c.sent();
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'terminal' }))];
            case 2:
                ui = _c.sent();
                _b = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: 'Blob' })];
            case 3:
                _b.apply(void 0, [_c.sent()]).toBeDefined();
                (0, testing_1.expect)(toasts.length).toBe(1);
                (0, testing_1.expect)(toasts[0]).toContain('Node.js was not found');
                return [4 /*yield*/, ui.unmount()];
            case 4:
                _c.sent();
                return [4 /*yield*/, start($)];
            case 5:
                _c.sent();
                (0, testing_1.expect)(toasts.length).toBe(1);
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('/pet use switches pets and remembers; an unknown id keeps the current one', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var start, missing, switched, ui, _a, listed;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                start = world(on).start;
                return [4 /*yield*/, start($)];
            case 1:
                _b.sent();
                return [4 /*yield*/, $.command.run({ command: 'pet', args: 'use nope' })];
            case 2:
                missing = _b.sent();
                (0, testing_1.expect)(missing.text).toContain('no pet named "nope"');
                (0, testing_1.expect)(missing.text).toContain('Still showing Tiny');
                return [4 /*yield*/, $.command.run({ command: 'pet', args: 'use other' })];
            case 3:
                switched = _b.sent();
                (0, testing_1.expect)(switched.text).toBe('Showing Other.');
                // the next session starts on the remembered pet
                return [4 /*yield*/, start($)];
            case 4:
                // the next session starts on the remembered pet
                _b.sent();
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { surface: 'terminal' }))];
            case 5:
                ui = _b.sent();
                _a = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: 'Other' })];
            case 6:
                _a.apply(void 0, [_b.sent()]).toBeDefined();
                return [4 /*yield*/, ui.unmount()];
            case 7:
                _b.sent();
                return [4 /*yield*/, $.command.run({ command: 'pet', args: 'list' })];
            case 8:
                listed = _b.sent();
                (0, testing_1.expect)(listed.text).toContain('tiny');
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('a slash command is not a turn: the pet stays idle while the band says working', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, clock, start, ui, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _a = world(on), clock = _a.clock, start = _a.start;
                return [4 /*yield*/, start($)];
            case 1:
                _c.sent();
                return [4 /*yield*/, clock.advance(2500)];
            case 2:
                _c.sent();
                return [4 /*yield*/, $.ui.mount(__assign(__assign({}, BAND), { props: __assign(__assign({}, BAND.props), { isWorking: true }), surface: 'terminal' }))];
            case 3:
                ui = _c.sent();
                return [4 /*yield*/, clock.advance(3000)];
            case 4:
                _c.sent();
                _b = testing_1.expect;
                return [4 /*yield*/, ui.find({ type: 'Text', text: 'idle' })];
            case 5:
                _b.apply(void 0, [_c.sent()]).toBeDefined();
                return [4 /*yield*/, ui.unmount()];
            case 6:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('/pet previews a mood, hides and shows the pet', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var start, _a, hidden, shown, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                start = world(on).start;
                return [4 /*yield*/, start($)];
            case 1:
                _c.sent();
                return [4 /*yield*/, $.command.run({ command: 'pet', args: 'review' })];
            case 2:
                _c.sent();
                _a = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 3:
                _a.apply(void 0, [_c.sent()]).toBe('ready for review');
                return [4 /*yield*/, $.command.run({ command: 'pet', args: 'hide' })];
            case 4:
                hidden = _c.sent();
                (0, testing_1.expect)(hidden.text).toContain('hidden');
                return [4 /*yield*/, $.command.run({ command: 'pet', args: 'show' })];
            case 5:
                shown = _c.sent();
                (0, testing_1.expect)(shown.text).toContain('back');
                _b = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 6:
                _b.apply(void 0, [_c.sent()]).toBe('ready for review');
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('a turn that answers: working, a jump, ready for review, idle', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, clock, start, _b, _c, _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                _a = world(on), clock = _a.clock, start = _a.start;
                return [4 /*yield*/, start($)];
            case 1:
                _g.sent();
                return [4 /*yield*/, $.turn.start({ text: 'hi', turnId: 't1' })];
            case 2:
                _g.sent();
                _b = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 3:
                _b.apply(void 0, [_g.sent()]).toBe('working…');
                // a subagent's turn ending changes nothing
                return [4 /*yield*/, $.turn.complete({ turnId: 't2', agentId: 'a1', reason: 'answer', answer: '' })];
            case 4:
                // a subagent's turn ending changes nothing
                _g.sent();
                _c = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 5:
                _c.apply(void 0, [_g.sent()]).toBe('working…');
                return [4 /*yield*/, $.turn.complete({ turnId: 't1', reason: 'answer', answer: '' })];
            case 6:
                _g.sent();
                _d = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 7:
                _d.apply(void 0, [_g.sent()]).toBe('done!');
                return [4 /*yield*/, clock.advance(800)];
            case 8:
                _g.sent();
                _e = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 9:
                _e.apply(void 0, [_g.sent()]).toBe('ready for review');
                return [4 /*yield*/, clock.advance(20000)];
            case 10:
                _g.sent();
                _f = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 11:
                _f.apply(void 0, [_g.sent()]).toBe('idle');
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('a turn that errors shows failed; an interrupted one goes idle', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, clock, start, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                _a = world(on), clock = _a.clock, start = _a.start;
                return [4 /*yield*/, start($)];
            case 1:
                _e.sent();
                return [4 /*yield*/, $.turn.start({ text: 'hi', turnId: 't1' })];
            case 2:
                _e.sent();
                return [4 /*yield*/, $.turn.complete({ turnId: 't1', reason: 'error', answer: '' })];
            case 3:
                _e.sent();
                _b = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 4:
                _b.apply(void 0, [_e.sent()]).toBe('that failed');
                return [4 /*yield*/, clock.advance(6000)];
            case 5:
                _e.sent();
                _c = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 6:
                _c.apply(void 0, [_e.sent()]).toBe('idle');
                return [4 /*yield*/, $.turn.start({ text: 'hi', turnId: 't2' })];
            case 7:
                _e.sent();
                return [4 /*yield*/, $.turn.complete({ turnId: 't2', reason: 'aborted', answer: '' })];
            case 8:
                _e.sent();
                _d = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 9:
                _d.apply(void 0, [_e.sent()]).toBe('idle');
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('agents left in flight keep the pet working until they end; a shell does not', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, clock, start, _b, _c, _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                _a = world(on), clock = _a.clock, start = _a.start;
                on('classic.Stop', function () { return ({}); });
                return [4 /*yield*/, start($)
                    // a dev server in the background is not the pet at work
                ];
            case 1:
                _f.sent();
                // a dev server in the background is not the pet at work
                return [4 /*yield*/, $.turn.start({ text: 'hi', turnId: 't1' })];
            case 2:
                // a dev server in the background is not the pet at work
                _f.sent();
                return [4 /*yield*/, $.turn.complete({ turnId: 't1', reason: 'answer', answer: '' })];
            case 3:
                _f.sent();
                return [4 /*yield*/, $.classic.Stop({
                        background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'dev server' }],
                    })];
            case 4:
                _f.sent();
                _b = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 5:
                _b.apply(void 0, [_f.sent()]).toBe('done!');
                // an agent is: the stop that names it may come after the turn's end
                return [4 /*yield*/, $.turn.start({ text: 'hi', turnId: 't2' })];
            case 6:
                // an agent is: the stop that names it may come after the turn's end
                _f.sent();
                return [4 /*yield*/, $.turn.complete({ turnId: 't2', reason: 'answer', answer: '' })];
            case 7:
                _f.sent();
                return [4 /*yield*/, $.classic.Stop({
                        background_tasks: [{ id: 'a1', type: 'agent', status: 'running', description: 'explore', agent_type: 'Explore' }],
                    })];
            case 8:
                _f.sent();
                _c = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 9:
                _c.apply(void 0, [_f.sent()]).toBe('working…');
                // the jump the turn's end began does not come back over it
                return [4 /*yield*/, clock.advance(1000)];
            case 10:
                // the jump the turn's end began does not come back over it
                _f.sent();
                _d = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 11:
                _d.apply(void 0, [_f.sent()]).toBe('working…');
                return [4 /*yield*/, $.turn.complete({ turnId: 't3', agentId: 'a1', reason: 'answer', answer: '' })];
            case 12:
                _f.sent();
                _e = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 13:
                _e.apply(void 0, [_f.sent()]).toBe('idle');
                return [2 /*return*/];
        }
    });
}); });
// A tool.call beneath the plugin that answers when the test lets it.
function heldCalls(on) {
    var release = new Map();
    on('tool.call', function (_, e) {
        return new Promise(function (resolve) {
            release.set(e.tool_use_id, function (isError) { return resolve({ result: {}, isError: isError }); });
        });
    });
    return function (id, isError) {
        var _a;
        if (isError === void 0) { isError = false; }
        return (_a = release.get(id)) === null || _a === void 0 ? void 0 : _a(isError);
    };
}
(0, testing_1.test)('a question is waiting until it is answered, whatever else returns meanwhile', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var start, finish, question, read, failing, _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                start = world(on).start;
                finish = heldCalls(on);
                return [4 /*yield*/, start($)];
            case 1:
                _e.sent();
                return [4 /*yield*/, $.turn.start({ text: 'hi', turnId: 't1' })];
            case 2:
                _e.sent();
                question = $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q1', questions: [] });
                read = $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/a' });
                failing = $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'false' });
                _a = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 3:
                _a.apply(void 0, [_e.sent()]).toBe('needs you');
                // another call ending, cleanly or not, is not the answer
                finish('r1');
                return [4 /*yield*/, read];
            case 4:
                _e.sent();
                _b = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 5:
                _b.apply(void 0, [_e.sent()]).toBe('needs you');
                finish('b1', true);
                return [4 /*yield*/, failing];
            case 6:
                _e.sent();
                _c = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 7:
                _c.apply(void 0, [_e.sent()]).toBe('needs you');
                finish('q1');
                return [4 /*yield*/, question];
            case 8:
                _e.sent();
                _d = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 9:
                _d.apply(void 0, [_e.sent()]).toBe('working…');
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('a permission asked: waiting until that tool returns; a refusal is no failure', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var start, finish, bash, read, _a, _b, _c, again, _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                start = world(on).start;
                finish = heldCalls(on);
                on('classic.PermissionRequest', function () { return ({}); });
                on('classic.PermissionDenied', function () { return ({}); });
                return [4 /*yield*/, start($)];
            case 1:
                _f.sent();
                return [4 /*yield*/, $.turn.start({ text: 'hi', turnId: 't1' })];
            case 2:
                _f.sent();
                bash = $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'make' });
                read = $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/a' });
                return [4 /*yield*/, $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} })];
            case 3:
                _f.sent();
                _a = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 4:
                _a.apply(void 0, [_f.sent()]).toBe('needs you');
                finish('r1');
                return [4 /*yield*/, read];
            case 5:
                _f.sent();
                _b = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 6:
                _b.apply(void 0, [_f.sent()]).toBe('needs you');
                finish('b1');
                return [4 /*yield*/, bash];
            case 7:
                _f.sent();
                _c = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 8:
                _c.apply(void 0, [_f.sent()]).toBe('working…');
                again = $.tool.call({ tool: 'Bash', tool_use_id: 'b2', command: 'rm -rf x' });
                return [4 /*yield*/, $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} })];
            case 9:
                _f.sent();
                return [4 /*yield*/, $.classic.PermissionDenied({ tool_name: 'Bash', tool_input: {} })];
            case 10:
                _f.sent();
                _d = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 11:
                _d.apply(void 0, [_f.sent()]).toBe('working…');
                finish('b2', true);
                return [4 /*yield*/, again];
            case 12:
                _f.sent();
                _e = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 13:
                _e.apply(void 0, [_f.sent()]).toBe('working…');
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('a failing call shows failed while its turn runs, not after an interrupt', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, clock, start, finish, first, _b, _c, cut, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                _a = world(on), clock = _a.clock, start = _a.start;
                finish = heldCalls(on);
                return [4 /*yield*/, start($)];
            case 1:
                _e.sent();
                return [4 /*yield*/, $.turn.start({ text: 'hi', turnId: 't1' })];
            case 2:
                _e.sent();
                first = $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'false' });
                return [4 /*yield*/, clock.advance(0)];
            case 3:
                _e.sent();
                finish('b1', true);
                return [4 /*yield*/, first];
            case 4:
                _e.sent();
                _b = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 5:
                _b.apply(void 0, [_e.sent()]).toBe('that failed');
                return [4 /*yield*/, clock.advance(2500)];
            case 6:
                _e.sent();
                _c = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 7:
                _c.apply(void 0, [_e.sent()]).toBe('working…');
                cut = $.tool.call({ tool: 'Bash', tool_use_id: 'b2', command: 'sleep 99' });
                return [4 /*yield*/, clock.advance(0)];
            case 8:
                _e.sent();
                return [4 /*yield*/, $.turn.complete({ turnId: 't1', reason: 'aborted', answer: '' })];
            case 9:
                _e.sent();
                finish('b2', true);
                return [4 /*yield*/, cut];
            case 10:
                _e.sent();
                _d = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 11:
                _d.apply(void 0, [_e.sent()]).toBe('idle');
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('on the terminal, the pill of the call that was asked ends the wait; another call\'s does not', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, clock, start, finish, pill, bash, fetch, _b, other, _c, asked, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                _a = world(on), clock = _a.clock, start = _a.start;
                finish = heldCalls(on);
                on('classic.PermissionRequest', function () { return ({}); });
                on('ui.render', { component: 'ToolProgress' }, function (engine, e) { return engine.ui.resolve(e).Text({ children: e.props.hint }); });
                return [4 /*yield*/, start($)];
            case 1:
                _e.sent();
                return [4 /*yield*/, $.turn.start({ text: 'hi', turnId: 't1' })];
            case 2:
                _e.sent();
                pill = function (id) {
                    return $.ui.mount({
                        plugin: 'codex-pet',
                        surface: 'terminal',
                        component: 'ToolProgress',
                        props: { tool_use_id: id, kind: 'background_hint', hint: '(ctrl+b to run in background)' },
                    });
                };
                bash = $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'make' });
                fetch = $.tool.call({ tool: 'WebFetch', tool_use_id: 'w1', url: 'https://example.com' });
                return [4 /*yield*/, $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} })];
            case 3:
                _e.sent();
                _b = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 4:
                _b.apply(void 0, [_e.sent()]).toBe('needs you');
                return [4 /*yield*/, pill('w1')];
            case 5:
                other = _e.sent();
                return [4 /*yield*/, clock.advance(1000)];
            case 6:
                _e.sent();
                _c = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 7:
                _c.apply(void 0, [_e.sent()]).toBe('needs you');
                return [4 /*yield*/, pill('b1')];
            case 8:
                asked = _e.sent();
                return [4 /*yield*/, clock.advance(1000)];
            case 9:
                _e.sent();
                _d = testing_1.expect;
                return [4 /*yield*/, labelOn($)];
            case 10:
                _d.apply(void 0, [_e.sent()]).toBe('working…');
                return [4 /*yield*/, other.unmount()];
            case 11:
                _e.sent();
                return [4 /*yield*/, asked.unmount()];
            case 12:
                _e.sent();
                finish('b1');
                finish('w1');
                return [4 /*yield*/, Promise.all([bash, fetch])];
            case 13:
                _e.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('/pet use takes no flag for an id; /pet refresh converts again', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, runs, start, flagged;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = world(on), runs = _a.runs, start = _a.start;
                return [4 /*yield*/, start($)];
            case 1:
                _b.sent();
                return [4 /*yield*/, $.command.run({ command: 'pet', args: 'use --force' })];
            case 2:
                flagged = _b.sent();
                (0, testing_1.expect)(flagged.text).toContain('Usage:');
                return [4 /*yield*/, $.command.run({ command: 'pet', args: 'refresh' })];
            case 3:
                _b.sent();
                (0, testing_1.expect)(runs.at(-1)).toEqual(['build', 'auto', '--force']);
                return [2 /*return*/];
        }
    });
}); });
