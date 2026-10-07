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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LABEL = exports.MOODS = exports.META_VERSION = void 0;
exports.isMood = isMood;
exports.petOf = petOf;
exports.stateOf = stateOf;
exports.frameCount = frameCount;
exports.cellsOf = cellsOf;
exports.imageOf = imageOf;
exports.svgOf = svgOf;
exports.META_VERSION = 6;
exports.MOODS = [
    'idle',
    'running-right',
    'running-left',
    'waving',
    'jumping',
    'failed',
    'waiting',
    'running',
    'review',
];
exports.LABEL = {
    idle: 'idle',
    'running-right': 'on the move',
    'running-left': 'on the move',
    waving: 'hi!',
    jumping: 'done!',
    failed: 'that failed',
    waiting: 'needs you',
    running: 'working…',
    review: 'ready for review',
};
var TRANSPARENT = 46; // '.'
var FIRST = 48; // '0': palette index n is the char FIRST + n
var DEFAULT_COLOR = 0x01000000;
function isMood(text) {
    return exports.MOODS.some(function (one) { return one === text; });
}
// What the converter wrote, or undefined when it is not that.
function petOf(text, dir) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    var meta;
    try {
        meta = JSON.parse(text);
    }
    catch (_s) {
        return undefined;
    }
    var isWhole = meta.version === exports.META_VERSION &&
        typeof meta.id === 'string' &&
        typeof meta.name === 'string' &&
        Array.isArray((_a = meta.lo) === null || _a === void 0 ? void 0 : _a.palette) &&
        ((_e = (_d = (_c = (_b = meta.lo) === null || _b === void 0 ? void 0 : _b.states) === null || _c === void 0 ? void 0 : _c.idle) === null || _d === void 0 ? void 0 : _d.length) !== null && _e !== void 0 ? _e : 0) > 0 &&
        ((_j = (_h = (_g = (_f = meta.tiny) === null || _f === void 0 ? void 0 : _f.states) === null || _g === void 0 ? void 0 : _g.idle) === null || _h === void 0 ? void 0 : _h.length) !== null && _j !== void 0 ? _j : 0) > 0 &&
        ((_l = (_k = meta.png) === null || _k === void 0 ? void 0 : _k.width) !== null && _l !== void 0 ? _l : 0) > 0 &&
        ((_o = (_m = meta.png) === null || _m === void 0 ? void 0 : _m.height) !== null && _o !== void 0 ? _o : 0) > 0 &&
        ((_r = (_q = (_p = meta.svg) === null || _p === void 0 ? void 0 : _p.frames) === null || _q === void 0 ? void 0 : _q.idle) !== null && _r !== void 0 ? _r : 0) > 0;
    if (!isWhole) {
        return undefined;
    }
    var whole = meta;
    return __assign(__assign({}, whole), { dir: dir, rgb: whole.lo.palette.map(function (hex) { return parseInt(hex.slice(1), 16); }), paths: new Map() });
}
// A state with no frames of its own is drawn as idle.
function stateOf(pet, mood) {
    var _a, _b;
    return ((_b = (_a = pet.lo.states[mood]) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) > 0 ? mood : 'idle';
}
function frameCount(pet, mood) {
    var _a, _b;
    return (_b = (_a = pet.lo.states[stateOf(pet, mood)]) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 1;
}
function colorAt(pet, frame, index) {
    var _a;
    var code = index < frame.length ? frame.charCodeAt(index) : TRANSPARENT;
    return code === TRANSPARENT ? -1 : ((_a = pet.rgb[code - FIRST]) !== null && _a !== void 0 ? _a : -1);
}
// A terminal frame as a Raster's cells, two pixels a cell: the upper half
// block's foreground over its background.
function cellsOf(pet, size, mood, at) {
    var _a, _b;
    var _c = pet[size], width = _c.width, height = _c.height, states = _c.states;
    var frames = (_a = states[stateOf(pet, mood)]) !== null && _a !== void 0 ? _a : [];
    var frame = (_b = frames[at % Math.max(1, frames.length)]) !== null && _b !== void 0 ? _b : '';
    var rows = Math.ceil(height / 2);
    var words = new Uint32Array(width * rows * 3);
    for (var row = 0; row < rows; row += 1) {
        for (var column = 0; column < width; column += 1) {
            var top_1 = colorAt(pet, frame, row * 2 * width + column);
            var bottom = row * 2 + 1 < height ? colorAt(pet, frame, (row * 2 + 1) * width + column) : -1;
            var index = (row * width + column) * 3;
            if (top_1 < 0 && bottom < 0) {
                words.set([0x20, DEFAULT_COLOR, DEFAULT_COLOR], index);
            }
            else if (top_1 < 0) {
                words.set([0x2584, bottom, DEFAULT_COLOR], index);
            }
            else {
                words.set([0x2580, top_1, bottom < 0 ? DEFAULT_COLOR : bottom], index);
            }
        }
    }
    return new Uint8Array(words.buffer).toBase64();
}
// One frame as the PNG file the converter left in the cache, for a terminal
// that shows images: it reads the file itself, so no pixel crosses the plugin.
function imageOf(pet, mood, at) {
    var state = stateOf(pet, mood);
    return { file: "".concat(pet.dir, "/png-").concat(state, "-").concat(at % frameCount(pet, mood), ".png"), format: 'png' };
}
// One desktop frame as an SVG of its own, or undefined until the state's
// markup is read. An image, so the band shows through it; and one frame an
// element, since a whole animation at the atlas's size fits none.
function svgOf(pet, mood, at) {
    var frames = pet.paths.get(stateOf(pet, mood));
    var paths = frames === null || frames === void 0 ? void 0 : frames[at % Math.max(1, frames.length)];
    if (paths === undefined) {
        return undefined;
    }
    var _a = pet.svg, width = _a.width, height = _a.height;
    // paths are written on whole rows; the half pixel centers each stroke on its row
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ".concat(width, " ").concat(height, "\" shape-rendering=\"crispEdges\" fill=\"none\" stroke-width=\"1\"><g transform=\"translate(0 .5)\">").concat(paths, "</g></svg>");
}
