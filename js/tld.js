(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.tld = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
/*! https://mths.be/punycode v1.4.1 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports &&
		!exports.nodeType && exports;
	var freeModule = typeof module == 'object' && module &&
		!module.nodeType && module;
	var freeGlobal = typeof global == 'object' && global;
	if (
		freeGlobal.global === freeGlobal ||
		freeGlobal.window === freeGlobal ||
		freeGlobal.self === freeGlobal
	) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw new RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		var result = [];
		while (length--) {
			result[length] = fn(array[length]);
		}
		return result;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings or email
	 * addresses.
	 * @private
	 * @param {String} domain The domain name or email address.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		var parts = string.split('@');
		var result = '';
		if (parts.length > 1) {
			// In email addresses, only the domain name should be punycoded. Leave
			// the local part (i.e. everything up to `@`) intact.
			result = parts[0] + '@';
			string = parts[1];
		}
		// Avoid `split(regex)` for IE8 compatibility. See #17.
		string = string.replace(regexSeparators, '\x2E');
		var labels = string.split('.');
		var encoded = map(labels, fn).join('.');
		return result + encoded;
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * https://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
	 * Punycode string of ASCII-only symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name or an email address
	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
	 * it doesn't matter if you call it on a string that has already been
	 * converted to Unicode.
	 * @memberOf punycode
	 * @param {String} input The Punycoded domain name or email address to
	 * convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(input) {
		return mapDomain(input, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name or an email address to
	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
	 * i.e. it doesn't matter if you call it with a domain that's already in
	 * ASCII.
	 * @memberOf punycode
	 * @param {String} input The domain name or email address to convert, as a
	 * Unicode string.
	 * @returns {String} The Punycode representation of the given domain name or
	 * email address.
	 */
	function toASCII(input) {
		return mapDomain(input, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.4.1',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && freeModule) {
		if (module.exports == freeExports) {
			// in Node.js, io.js, or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else {
			// in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else {
		// in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],2:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],3:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],4:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":2,"./encode":3}],5:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var punycode = require('punycode');
var util = require('./util');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // Special case for a simple path URL
    simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && util.isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!util.isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  // Copy chrome, IE, opera backslash-handling behavior.
  // Back slashes before the query string get converted to forward slashes
  // See: https://code.google.com/p/chromium/issues/detail?id=25916
  var queryIndex = url.indexOf('?'),
      splitter =
          (queryIndex !== -1 && queryIndex < url.indexOf('#')) ? '?' : '#',
      uSplit = url.split(splitter),
      slashRegex = /\\/g;
  uSplit[0] = uSplit[0].replace(slashRegex, '/');
  url = uSplit.join(splitter);

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  if (!slashesDenoteHost && url.split('#').length === 1) {
    // Try fast path regexp
    var simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.path = rest;
      this.href = rest;
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
        if (parseQueryString) {
          this.query = querystring.parse(this.search.substr(1));
        } else {
          this.query = this.search.substr(1);
        }
      } else if (parseQueryString) {
        this.search = '';
        this.query = {};
      }
      return this;
    }
  }

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a punycoded representation of "domain".
      // It only converts parts of the domain name that
      // have non-ASCII characters, i.e. it doesn't matter if
      // you call it with a domain that already is ASCII-only.
      this.hostname = punycode.toASCII(this.hostname);
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      if (rest.indexOf(ae) === -1)
        continue;
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (util.isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      util.isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (util.isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  var tkeys = Object.keys(this);
  for (var tk = 0; tk < tkeys.length; tk++) {
    var tkey = tkeys[tk];
    result[tkey] = this[tkey];
  }

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    var rkeys = Object.keys(relative);
    for (var rk = 0; rk < rkeys.length; rk++) {
      var rkey = rkeys[rk];
      if (rkey !== 'protocol')
        result[rkey] = relative[rkey];
    }

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      var keys = Object.keys(relative);
      for (var v = 0; v < keys.length; v++) {
        var k = keys[v];
        result[k] = relative[k];
      }
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!util.isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host || srcPath.length > 1) &&
      (last === '.' || last === '..') || last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last === '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especially happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

},{"./util":6,"punycode":1,"querystring":4}],6:[function(require,module,exports){
'use strict';

module.exports = {
  isString: function(arg) {
    return typeof(arg) === 'string';
  },
  isObject: function(arg) {
    return typeof(arg) === 'object' && arg !== null;
  },
  isNull: function(arg) {
    return arg === null;
  },
  isNullOrUndefined: function(arg) {
    return arg == null;
  }
};

},{}],7:[function(require,module,exports){
"use strict";

function Rule (data){
  data = data || {};

  this.exception = data.exception || false;
  this.firstLevel = data.firstLevel || '';
  this.secondLevel = data.secondLevel || null;
  this.isHost = data.isHost || false;
  this.source = data.source || '';
  this.wildcard = data.wildcard || false;
}

/**
 * Returns the TLD or SLD (Second Level Domain) pattern for a rule
 *
 * @return {String}
 */
Rule.prototype.getNormalXld = function getNormalXld(){
  return (this.secondLevel ? '.' + this.secondLevel : '') + '.' + this.firstLevel;
};

/**
 * Returns a pattern suitable for normal rule
 * Mostly for internal use
 *
 * @return {String}
 */
Rule.prototype.getNormalPattern = function getNormalPattern(){
  return (this.secondLevel ? '\\.' + this.secondLevel : '') + '\\.' + this.firstLevel;
};

/**
 * Returns a pattern suitable for wildcard rule
 * Mostly for internal use
 *
 * @return {String}
 */
Rule.prototype.getWildcardPattern = function getWildcardPattern(){
  return '\\.[^\\.]+' + this.getNormalXld().replace(/\./g, '\\.');
};

/**
 * Returns a pattern suitable for exception rule
 * Mostly for internal use
 *
 * @return {String}
 */
Rule.prototype.getExceptionPattern = function getExceptionPattern(){
  return (this.secondLevel || '') + '\\.' + this.firstLevel;
};

/**
 * Returns the best pattern possible for a rule
 * You just have to test a value against it to check or extract a hostname
 *
 * @api
 * @param {string|undefined} before
 * @param {string|undefined} after
 * @return {String} A pattern to challenge some string against
 */
Rule.prototype.getPattern = function getPattern(before, after){
  var pattern = '';

  before = (before === undefined) ? '(': before+'';
  after = (after === undefined) ? ')$': after+'';

  if (this.exception === true){
    pattern = this.getExceptionPattern();
  }
  else if (this.isHost === true) {
    pattern = this.firstLevel;
  }
  else{
    pattern = '[^\\.]+' + (this.wildcard ? this.getWildcardPattern() : this.getNormalPattern());
  }

  return before + pattern + after;
};

module.exports = Rule;

},{}],8:[function(require,module,exports){
"use strict";

var Rule = require('./rule.js');
var URL = require('url');

/**
 * tld library
 *
 * Useable methods are those documented with an @api in JSDoc
 * See README.md for more explanations on how to use this stuff.
 */
function tld () {
  /* jshint validthis: true */
  this.validHosts = [];
  this.rules = [];
}

tld.init = function init () {
  return new tld();
};

function trim(value) {
  return String(value).replace(/(^\s+|\s+$)/g, '');
}

// Array.some() polyfill for IE8
function _someFunction(value, fun /*, thisArg */) {
    'use strict';

    if (value === void 0 || value === null)
      throw new TypeError();

    var t = Object(value);
    var len = t.length >>> 0;
    if (typeof fun !== 'function') {
      throw new TypeError();
    }

    var thisArg = arguments.length >= 3 ? arguments[2] : void 0;
    for (var i = 0; i < len; i++)
    {
      if (i in t && fun.call(thisArg, t[i], i, t))
        return true;
    }

    return false;
}

// Array.map polyfill for IE8
function _mapFunction(thisVal, fun /*, thisArg */) {
  "use strict";

  if (thisVal === void 0 || thisVal === null)
    throw new TypeError();

  var t = Object(thisVal);
  var len = t.length >>> 0;
  if (typeof fun !== "function") {
    throw new TypeError();
  }

  var res = new Array(len);
  var thisArg = arguments.length >= 3 ? arguments[2] : void 0;

  for (var i = 0; i < len; i++)
  {
    // NOTE: Absolute correctness would demand Object.defineProperty
    //       be used.  But this method is fairly new, and failure is
    //       possible only if Object.prototype or Array.prototype
    //       has a property |i| (very unlikely), so use a lesscorrect
    //       but more portable alternative.
    if (i in t)
      res[i] = fun.call(thisArg, t[i], i, t);
  }

  return res;
};

/**
 * Returns the best rule for a given host based on candidates
 *
 * @static
 * @param host {String} Hostname to check rules against
 * @param rules {Array} List of rules used to work on
 * @return {Object} Candidate object, with a normal and exception state
 */
tld.getCandidateRule = function getCandidateRule (host, rules, options) {
  var rule = {'normal': null, 'exception': null};

  options = options || { lazy: false };

  _someFunction(rules, function (r) {
    var pattern;

    // sld matching or validHost? escape the loop immediately (except if it's an exception)
    if ('.' + host === r.getNormalXld()) {
      if (options.lazy || r.exception || r.isHost) {
        rule.normal = r;
      }

      return true;
    }

    // otherwise check as a complete host
    // if it's an exception, we want to loop a bit more to a normal rule
    pattern = '.+' + r.getNormalPattern() + '$';

    if ((new RegExp(pattern)).test(host)) {
      rule[r.exception ? 'exception' : 'normal'] = r;
      return !r.exception;
    }

    return false;
  });

  // favouring the exception if encountered
  // previously we were copy-altering a rule, creating inconsistent results based on rule order order
  // @see https://github.com/oncletom/tld.js/pull/35
  if (rule.normal && rule.exception) {
    return rule.exception;
  }

  return rule.normal;
};

/**
 * Retrieve a subset of rules for a Top-Level-Domain string
 *
 * @param tld {String} Top-Level-Domain string
 * @return {Array} Rules subset
 */
tld.prototype.getRulesForTld = function getRulesForTld (tld, default_rule) {
  var exception = '!';
  var wildcard = '*';
  var append_tld_rule = true;
  var rules = this.rules[tld];

  // Already parsed
  // Array.isArray polyfill for IE8
  if (Object.prototype.toString.call(rules)  === '[object Array]') {
    return rules;
  }

  // Nothing found, apply some default value
  if (rules === void 0) {
    return default_rule ? [ default_rule ] : [];
  }

  // Parsing needed
  rules = _mapFunction(rules.split('|'), function transformAsRule (sld) {
    var first_bit = sld[0];

    if (first_bit === exception || first_bit === wildcard) {
      sld = sld.slice(1);

      if (!sld) {
        append_tld_rule = false;
      }
    }

    return new Rule({
      "firstLevel":  tld,
      "secondLevel": sld,
      "exception":   first_bit === exception,
      "wildcard":    first_bit === wildcard
    });
  });

  // Always prepend to make it the latest rule to be applied
  if (append_tld_rule) {
    rules.unshift(new Rule({
      "firstLevel": tld
    }));
  }

  this.rules[tld] = rules.reverse();

  return rules;
};

/**
 * Checks if the TLD exists for a given host
 *
 * @api
 * @param {string} host
 * @return {boolean}
 */
tld.prototype.tldExists = function tldExists(host){
  var hostTld;

  host = tld.cleanHostValue(host);

  // Easy case, it's a TLD
  if (this.rules[host]){
    return true;
  }

  // Popping only the TLD of the hostname
  hostTld = tld.extractTldFromHost(host);

  return this.rules[hostTld] !== undefined;
};

/**
 * Returns the public suffix (including exact matches)
 *
 * @api
 * @since 1.5
 * @param {string} host
 * @return {String}
 */
tld.prototype.getPublicSuffix = function getPublicSuffix(host) {
  var hostTld, rules, rule;

  if (host in this.rules){
	  return host;
  }

  host = tld.cleanHostValue(host);
  hostTld = tld.extractTldFromHost(host);
  rules = this.getRulesForTld(hostTld);
  rule = tld.getCandidateRule(host, rules, { lazy: true });

  if (rule === null) {
    return null;
  }

  return rule.getNormalXld().slice(1);
};

/**
 * Detects the domain based on rules and upon and a host string
 *
 * @api
 * @param {string} host
 * @return {String}
 */
tld.prototype.getDomain = function getDomain (host) {
  var domain = null, hostTld, rules, rule;

  if (this.isValid(host) === false) {
    return null;
  }

  host = tld.cleanHostValue(host);
  hostTld = tld.extractTldFromHost(host);
  rules = this.getRulesForTld(hostTld, new Rule({"firstLevel": hostTld, "isHost": this.validHosts.indexOf(hostTld) !== -1}));
  rule = tld.getCandidateRule(host, rules);

  if (rule === null) {
    return null;
  }

  host.replace(new RegExp(rule.getPattern()), function (m, d) {
    domain = d;
  });

  return domain;
};

/**
 * Returns the subdomain of a host string
 *
 * @api
 * @param {string} host
 * @return {string|null} a subdomain string if any, blank string if subdomain is empty, otherwise null
 */
tld.prototype.getSubdomain = function getSubdomain(host){
  var domain, r, subdomain;

  host = tld.cleanHostValue(host);
  domain = this.getDomain(host);

  // No domain found? Just abort, abort!
  if (domain === null){
    return null;
  }

  r = '\\.?'+ tld.escapeRegExp(domain)+'$';
  subdomain = host.replace(new RegExp(r, 'i'), '');

  return subdomain;
};

/**
 * Checking if a host string is valid
 * It's usually a preliminary check before trying to use getDomain or anything else
 *
 * Beware: it does not check if the TLD exists.
 *
 * @api
 * @param host {String}
 * @return {Boolean}
 */
tld.prototype.isValid = function isValid (host) {
  return typeof host === 'string' && (this.validHosts.indexOf(host) !== -1 || (host.indexOf('.') !== -1 && host[0] !== '.'));
};

/**
 * Utility to cleanup the base host value. Also removes url fragments.
 *
 * Works for:
 * - hostname
 * - //hostname
 * - scheme://hostname
 * - scheme+scheme://hostname
 *
 * @param {string} value
 * @return {String}
 */

// scheme      = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
var hasPrefixRE = /^(([a-z][a-z0-9+.-]*)?:)?\/\//;
var invalidHostnameChars = /[^A-Za-z0-9.-]/;

tld.cleanHostValue = function cleanHostValue(value){
  value = trim(value).toLowerCase();

  var parts = URL.parse(hasPrefixRE.test(value) ? value : '//' + value, null, true);

  if (parts.hostname && !invalidHostnameChars.test(parts.hostname)) { return parts.hostname; }
  if (!invalidHostnameChars.test(value)) { return value; }
  return '';
};

/**
 * Utility to extract the TLD from a host string
 *
 * @param {string} host
 * @return {String}
 */
tld.extractTldFromHost = function extractTldFromHost(host){
  return host.split('.').pop();
};

/**
 * Escapes RegExp specific chars.
 *
 * @since 1.3.1
 * @see https://github.com/oncletom/tld.js/pull/33
 * @param {String|Mixed} s
 * @returns {string} Escaped string for a safe use in a `new RegExp` expression
 */
tld.escapeRegExp = function escapeRegExp(s) {
  return String(s).replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
};

module.exports = tld;

},{"./rule.js":7,"url":5}],9:[function(require,module,exports){
module.exports={"ac":"com|edu|gov|net|mil|org","ad":"nom","ae":"co|net|org|sch|ac|gov|mil","aero":"","af":"gov|com|org|net|edu","ag":"com|org|net|co|nom","ai":"off|com|net|org","al":"com|edu|gov|mil|net|org","am":"","ao":"ed|gv|og|co|pb|it","aq":"","ar":"com|edu|gob|gov|int|mil|net|org|tur","arpa":"e164|in-addr|ip6|iris|uri|urn","as":"gov","asia":"","at":"ac|co|gv|or|biz|info|priv","au":"com|net|org|edu|gov|asn|id|info|conf|oz|act|nsw|nt|qld|sa|tas|vic|wa|act.edu|nsw.edu|nt.edu|qld.edu|sa.edu|tas.edu|vic.edu|wa.edu|qld.gov|sa.gov|tas.gov|vic.gov|wa.gov","aw":"com","ax":"","az":"com|net|int|gov|org|edu|info|pp|mil|name|pro|biz","ba":"org|net|edu|gov|mil|unsa|unbi|co|com|rs","bb":"biz|co|com|edu|gov|info|net|org|store|tv","bd":"*","be":"ac","bf":"gov","bg":"a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z|0|1|2|3|4|5|6|7|8|9","bh":"com|edu|net|org|gov","bi":"co|com|edu|or|org","biz":"dyndns","bj":"asso|barreau|gouv","bm":"com|edu|gov|net|org","bn":"*","bo":"com|edu|gov|gob|int|org|net|mil|tv","br":"adm|adv|agr|am|arq|art|ato|b|bio|blog|bmd|cim|cng|cnt|com|coop|ecn|eco|edu|emp|eng|esp|etc|eti|far|flog|fm|fnd|fot|fst|g12|ggf|gov|imb|ind|inf|jor|jus|leg|lel|mat|med|mil|mp|mus|net|*nom|not|ntr|odo|org|ppg|pro|psc|psi|qsl|radio|rec|slg|srv|taxi|teo|tmp|trd|tur|tv|vet|vlog|wiki|zlg","bs":"com|net|org|edu|gov","bt":"com|edu|gov|net|org","bv":"","bw":"co|org","by":"gov|mil|com|of","bz":"com|net|org|edu|gov|za","ca":"ab|bc|mb|nb|nf|nl|ns|nt|nu|on|pe|qc|sk|yk|gc|co","cat":"","cc":"","cd":"gov","cf":"","cg":"","ch":"","ci":"org|or|com|co|edu|ed|ac|net|go|asso|int|presse|md|gouv","ck":"*|!www","cl":"gov|gob|co|mil","cm":"co|com|gov|net","cn":"ac|com|edu|gov|net|org|mil|xn--55qx5d|xn--io0a7i|xn--od0alg|ah|bj|cq|fj|gd|gs|gz|gx|ha|hb|he|hi|hl|hn|jl|js|jx|ln|nm|nx|qh|sc|sd|sh|sn|sx|tj|xj|xz|yn|zj|hk|mo|tw","co":"arts|com|edu|firm|gov|info|int|mil|net|nom|org|rec|web","com":"ar|br|cn|de|eu|gb|hu|jpn|kr|mex|no|qc|ru|sa|se|uk|us|uy|za|africa|gr|co|ro|hk","coop":"","cr":"ac|co|ed|fi|go|or|sa","cu":"com|edu|org|net|gov|inf","cv":"","cw":"com|edu|net|org","cx":"gov|ath","cy":"ac|biz|com|ekloges|gov|ltd|name|net|org|pro|tm","cz":"","de":"com","dj":"","dk":"","dm":"com|net|org|edu|gov","do":"art|com|edu|gob|gov|mil|net|org|sld|web","dz":"com|org|net|gov|edu|asso|pol|art","ec":"com|info|net|fin|k12|med|pro|org|edu|gov|gob|mil","edu":"","ee":"edu|gov|riik|lib|med|com|pri|aip|org|fie","eg":"com|edu|eun|gov|mil|name|net|org|sci","er":"*","es":"com|nom|org|gob|edu","et":"com|gov|org|edu|biz|name|info|net","eu":"","fi":"iki","fj":"*","fk":"*","fm":"","fo":"","fr":"com|asso|nom|prd|tm","ga":"","gb":"","gd":"","ge":"com|edu|gov|org|mil|net|pvt","gf":"","gg":"co|net|org","gh":"com|edu|gov|org|mil","gi":"com|ltd|gov|mod|edu|org","gl":"co|com|edu|net|org","gm":"","gn":"ac|com|edu|gov|org|net","gov":"","gp":"com|net|mobi|edu|org|asso","gq":"","gr":"com|edu|net|org|gov","gs":"","gt":"com|edu|gob|ind|mil|net|org","gu":"*","gw":"","gy":"co|com|net","hk":"com|edu|gov|idv|net|org|xn--55qx5d|xn--wcvs22d|xn--lcvr32d|xn--mxtq1m|xn--gmqw5a|xn--ciqpn|xn--gmq050i|xn--zf0avx|xn--io0a7i|xn--mk0axi|xn--od0alg|xn--od0aq3b|xn--tn0ag|xn--uc0atv|xn--uc0ay4a|ltd|inc","hm":"","hn":"com|edu|org|net|mil|gob","hr":"iz|from|name|com","ht":"com|shop|firm|info|adult|net|pro|org|med|art|coop|pol|asso|edu|rel|gouv|perso","hu":"co|info|org|priv|sport|tm|2000|agrar|bolt|casino|city|erotica|erotika|film|forum|games|hotel|ingatlan|jogasz|konyvelo|lakas|media|news|reklam|sex|shop|suli|szex|tozsde|utazas|video","id":"ac|biz|co|desa|go|mil|my|net|or|sch|web","ie":"gov","il":"ac|co|gov|idf|k12|muni|net|org","im":"ac|co|com|ltd.co|net|org|plc.co|tt|tv","in":"co|firm|net|org|gen|ind|nic|ac|edu|res|gov|mil","info":"","int":"eu","io":"com|ngrok|nid","iq":"gov|edu|mil|com|org|net","ir":"ac|co|gov|id|net|org|sch|xn--mgba3a4f16a|xn--mgba3a4fra","is":"net|com|edu|gov|org|int","it":"gov|edu|abr|abruzzo|aosta-valley|aostavalley|bas|basilicata|cal|calabria|cam|campania|emilia-romagna|emiliaromagna|emr|friuli-v-giulia|friuli-ve-giulia|friuli-vegiulia|friuli-venezia-giulia|friuli-veneziagiulia|friuli-vgiulia|friuliv-giulia|friulive-giulia|friulivegiulia|friulivenezia-giulia|friuliveneziagiulia|friulivgiulia|fvg|laz|lazio|lig|liguria|lom|lombardia|lombardy|lucania|mar|marche|mol|molise|piedmont|piemonte|pmn|pug|puglia|sar|sardegna|sardinia|sic|sicilia|sicily|taa|tos|toscana|trentino-a-adige|trentino-aadige|trentino-alto-adige|trentino-altoadige|trentino-s-tirol|trentino-stirol|trentino-sud-tirol|trentino-sudtirol|trentino-sued-tirol|trentino-suedtirol|trentinoa-adige|trentinoaadige|trentinoalto-adige|trentinoaltoadige|trentinos-tirol|trentinostirol|trentinosud-tirol|trentinosudtirol|trentinosued-tirol|trentinosuedtirol|tuscany|umb|umbria|val-d-aosta|val-daosta|vald-aosta|valdaosta|valle-aosta|valle-d-aosta|valle-daosta|valleaosta|valled-aosta|valledaosta|vallee-aoste|valleeaoste|vao|vda|ven|veneto|ag|agrigento|al|alessandria|alto-adige|altoadige|an|ancona|andria-barletta-trani|andria-trani-barletta|andriabarlettatrani|andriatranibarletta|ao|aosta|aoste|ap|aq|aquila|ar|arezzo|ascoli-piceno|ascolipiceno|asti|at|av|avellino|ba|balsan|bari|barletta-trani-andria|barlettatraniandria|belluno|benevento|bergamo|bg|bi|biella|bl|bn|bo|bologna|bolzano|bozen|br|brescia|brindisi|bs|bt|bz|ca|cagliari|caltanissetta|campidano-medio|campidanomedio|campobasso|carbonia-iglesias|carboniaiglesias|carrara-massa|carraramassa|caserta|catania|catanzaro|cb|ce|cesena-forli|cesenaforli|ch|chieti|ci|cl|cn|co|como|cosenza|cr|cremona|crotone|cs|ct|cuneo|cz|dell-ogliastra|dellogliastra|en|enna|fc|fe|fermo|ferrara|fg|fi|firenze|florence|fm|foggia|forli-cesena|forlicesena|fr|frosinone|ge|genoa|genova|go|gorizia|gr|grosseto|iglesias-carbonia|iglesiascarbonia|im|imperia|is|isernia|kr|la-spezia|laquila|laspezia|latina|lc|le|lecce|lecco|li|livorno|lo|lodi|lt|lu|lucca|macerata|mantova|massa-carrara|massacarrara|matera|mb|mc|me|medio-campidano|mediocampidano|messina|mi|milan|milano|mn|mo|modena|monza-brianza|monza-e-della-brianza|monza|monzabrianza|monzaebrianza|monzaedellabrianza|ms|mt|na|naples|napoli|no|novara|nu|nuoro|og|ogliastra|olbia-tempio|olbiatempio|or|oristano|ot|pa|padova|padua|palermo|parma|pavia|pc|pd|pe|perugia|pesaro-urbino|pesarourbino|pescara|pg|pi|piacenza|pisa|pistoia|pn|po|pordenone|potenza|pr|prato|pt|pu|pv|pz|ra|ragusa|ravenna|rc|re|reggio-calabria|reggio-emilia|reggiocalabria|reggioemilia|rg|ri|rieti|rimini|rm|rn|ro|roma|rome|rovigo|sa|salerno|sassari|savona|si|siena|siracusa|so|sondrio|sp|sr|ss|suedtirol|sv|ta|taranto|te|tempio-olbia|tempioolbia|teramo|terni|tn|to|torino|tp|tr|trani-andria-barletta|trani-barletta-andria|traniandriabarletta|tranibarlettaandria|trapani|trentino|trento|treviso|trieste|ts|turin|tv|ud|udine|urbino-pesaro|urbinopesaro|va|varese|vb|vc|ve|venezia|venice|verbania|vercelli|verona|vi|vibo-valentia|vibovalentia|vicenza|viterbo|vr|vs|vt|vv","je":"co|net|org","jm":"*","jo":"com|org|net|edu|sch|gov|mil|name","jobs":"","jp":"ac|ad|co|ed|go|gr|lg|ne|or","ke":"*","kg":"org|net|com|edu|gov|mil","kh":"*","ki":"edu|biz|net|org|gov|info|com","km":"org|nom|gov|prd|tm|edu|mil|ass|com|coop|asso|presse|medecin|notaires|pharmaciens|veterinaire|gouv","kn":"net|org|edu|gov","kp":"com|edu|gov|org|rep|tra","kr":"ac|co|es|go|hs|kg|mil|ms|ne|or|pe|re|sc|busan|chungbuk|chungnam|daegu|daejeon|gangwon|gwangju|gyeongbuk|gyeonggi|gyeongnam|incheon|jeju|jeonbuk|jeonnam|seoul|ulsan","kw":"*","ky":"edu|gov|com|org|net","kz":"org|edu|net|gov|mil|com","la":"int|net|info|edu|gov|per|com|org|c","lb":"com|edu|gov|net|org","lc":"com|net|co|org|edu|gov","li":"","lk":"gov|sch|net|int|com|org|edu|ngo|soc|web|ltd|assn|grp|hotel|ac","lr":"com|edu|gov|org|net","ls":"co|org","lt":"gov","lu":"","lv":"com|edu|gov|org|mil|id|net|asn|conf","ly":"com|net|gov|plc|edu|sch|med|org|id","ma":"co|net|gov|org|ac|press","mc":"tm|asso","md":"","me":"co|net|org|edu|ac|gov|its|priv","mg":"org|nom|gov|prd|tm|edu|mil|com|co","mh":"","mil":"","mk":"com|org|net|edu|gov|inf|name","ml":"com|edu|gouv|gov|net|org|presse","mm":"*","mn":"gov|edu|org|nyc","mo":"com|net|org|edu|gov","mobi":"","mp":"","mq":"","mr":"gov","ms":"com|edu|gov|net|org","mt":"com|edu|net|org","mu":"com|net|org|gov|ac|co|or","museum":"","mv":"aero|biz|com|coop|edu|gov|info|int|mil|museum|name|net|org|pro","mw":"ac|biz|co|com|coop|edu|gov|int|museum|net|org","mx":"com|org|gob|edu|net","my":"com|net|org|gov|edu|mil|name","mz":"*|!teledata","na":"info|pro|name|school|or|dr|us|mx|ca|in|cc|tv|ws|mobi|co|com|org","name":"","nc":"asso","ne":"","net":"gb|hu|jp|se|uk|in|za","nf":"com|net|per|rec|web|arts|firm|info|other|store","ng":"com|edu|name|net|org|sch|gov|mil|mobi","ni":"*","nl":"bv|co","no":"fhs|vgs|fylkesbibl|folkebibl|museum|idrett|priv|mil|stat|dep|kommune|herad|aa|ah|bu|fm|hl|hm|jan-mayen|mr|nl|nt|of|ol|oslo|rl|sf|st|svalbard|tm|tr|va|vf|gs.aa|gs.ah|gs.bu|gs.fm|gs.hl|gs.hm|gs.jan-mayen|gs.mr|gs.nl|gs.nt|gs.of|gs.ol|gs.oslo|gs.rl|gs.sf|gs.st|gs.svalbard|gs.tm|gs.tr|gs.va|gs.vf|akrehamn|xn--krehamn-dxa|algard|xn--lgrd-poac|arna|brumunddal|bryne|bronnoysund|xn--brnnysund-m8ac|drobak|xn--drbak-wua|egersund|fetsund|floro|xn--flor-jra|fredrikstad|hokksund|honefoss|xn--hnefoss-q1a|jessheim|jorpeland|xn--jrpeland-54a|kirkenes|kopervik|krokstadelva|langevag|xn--langevg-jxa|leirvik|mjondalen|xn--mjndalen-64a|mo-i-rana|mosjoen|xn--mosjen-eya|nesoddtangen|orkanger|osoyro|xn--osyro-wua|raholt|xn--rholt-mra|sandnessjoen|xn--sandnessjen-ogb|skedsmokorset|slattum|spjelkavik|stathelle|stavern|stjordalshalsen|xn--stjrdalshalsen-sqb|tananger|tranby|vossevangen|afjord|xn--fjord-lra|agdenes|al|xn--l-1fa|alesund|xn--lesund-hua|alstahaug|alta|xn--lt-liac|alaheadju|xn--laheadju-7ya|alvdal|amli|xn--mli-tla|amot|xn--mot-tla|andebu|andoy|xn--andy-ira|andasuolo|ardal|xn--rdal-poa|aremark|arendal|xn--s-1fa|aseral|xn--seral-lra|asker|askim|askvoll|askoy|xn--asky-ira|asnes|xn--snes-poa|audnedaln|aukra|aure|aurland|aurskog-holand|xn--aurskog-hland-jnb|austevoll|austrheim|averoy|xn--avery-yua|balestrand|ballangen|balat|xn--blt-elab|balsfjord|bahccavuotna|xn--bhccavuotna-k7a|bamble|bardu|beardu|beiarn|bajddar|xn--bjddar-pta|baidar|xn--bidr-5nac|berg|bergen|berlevag|xn--berlevg-jxa|bearalvahki|xn--bearalvhki-y4a|bindal|birkenes|bjarkoy|xn--bjarky-fya|bjerkreim|bjugn|bodo|xn--bod-2na|badaddja|xn--bdddj-mrabd|budejju|bokn|bremanger|bronnoy|xn--brnny-wuac|bygland|bykle|barum|xn--brum-voa|bo.telemark|xn--b-5ga.telemark|bo.nordland|xn--b-5ga.nordland|bievat|xn--bievt-0qa|bomlo|xn--bmlo-gra|batsfjord|xn--btsfjord-9za|bahcavuotna|xn--bhcavuotna-s4a|dovre|drammen|drangedal|dyroy|xn--dyry-ira|donna|xn--dnna-gra|eid|eidfjord|eidsberg|eidskog|eidsvoll|eigersund|elverum|enebakk|engerdal|etne|etnedal|evenes|evenassi|xn--eveni-0qa01ga|evje-og-hornnes|farsund|fauske|fuossko|fuoisku|fedje|fet|finnoy|xn--finny-yua|fitjar|fjaler|fjell|flakstad|flatanger|flekkefjord|flesberg|flora|fla|xn--fl-zia|folldal|forsand|fosnes|frei|frogn|froland|frosta|frana|xn--frna-woa|froya|xn--frya-hra|fusa|fyresdal|forde|xn--frde-gra|gamvik|gangaviika|xn--ggaviika-8ya47h|gaular|gausdal|gildeskal|xn--gildeskl-g0a|giske|gjemnes|gjerdrum|gjerstad|gjesdal|gjovik|xn--gjvik-wua|gloppen|gol|gran|grane|granvin|gratangen|grimstad|grong|kraanghke|xn--kranghke-b0a|grue|gulen|hadsel|halden|halsa|hamar|hamaroy|habmer|xn--hbmer-xqa|hapmir|xn--hpmir-xqa|hammerfest|hammarfeasta|xn--hmmrfeasta-s4ac|haram|hareid|harstad|hasvik|aknoluokta|xn--koluokta-7ya57h|hattfjelldal|aarborte|haugesund|hemne|hemnes|hemsedal|heroy.more-og-romsdal|xn--hery-ira.xn--mre-og-romsdal-qqb|heroy.nordland|xn--hery-ira.nordland|hitra|hjartdal|hjelmeland|hobol|xn--hobl-ira|hof|hol|hole|holmestrand|holtalen|xn--holtlen-hxa|hornindal|horten|hurdal|hurum|hvaler|hyllestad|hagebostad|xn--hgebostad-g3a|hoyanger|xn--hyanger-q1a|hoylandet|xn--hylandet-54a|ha|xn--h-2fa|ibestad|inderoy|xn--indery-fya|iveland|jevnaker|jondal|jolster|xn--jlster-bya|karasjok|karasjohka|xn--krjohka-hwab49j|karlsoy|galsa|xn--gls-elac|karmoy|xn--karmy-yua|kautokeino|guovdageaidnu|klepp|klabu|xn--klbu-woa|kongsberg|kongsvinger|kragero|xn--krager-gya|kristiansand|kristiansund|krodsherad|xn--krdsherad-m8a|kvalsund|rahkkeravju|xn--rhkkervju-01af|kvam|kvinesdal|kvinnherad|kviteseid|kvitsoy|xn--kvitsy-fya|kvafjord|xn--kvfjord-nxa|giehtavuoatna|kvanangen|xn--kvnangen-k0a|navuotna|xn--nvuotna-hwa|kafjord|xn--kfjord-iua|gaivuotna|xn--givuotna-8ya|larvik|lavangen|lavagis|loabat|xn--loabt-0qa|lebesby|davvesiida|leikanger|leirfjord|leka|leksvik|lenvik|leangaviika|xn--leagaviika-52b|lesja|levanger|lier|lierne|lillehammer|lillesand|lindesnes|lindas|xn--linds-pra|lom|loppa|lahppi|xn--lhppi-xqa|lund|lunner|luroy|xn--lury-ira|luster|lyngdal|lyngen|ivgu|lardal|lerdal|xn--lrdal-sra|lodingen|xn--ldingen-q1a|lorenskog|xn--lrenskog-54a|loten|xn--lten-gra|malvik|masoy|xn--msy-ula0h|muosat|xn--muost-0qa|mandal|marker|marnardal|masfjorden|meland|meldal|melhus|meloy|xn--mely-ira|meraker|xn--merker-kua|moareke|xn--moreke-jua|midsund|midtre-gauldal|modalen|modum|molde|moskenes|moss|mosvik|malselv|xn--mlselv-iua|malatvuopmi|xn--mlatvuopmi-s4a|namdalseid|aejrie|namsos|namsskogan|naamesjevuemie|xn--nmesjevuemie-tcba|laakesvuemie|nannestad|narvik|narviika|naustdal|nedre-eiker|nes.akershus|nes.buskerud|nesna|nesodden|nesseby|unjarga|xn--unjrga-rta|nesset|nissedal|nittedal|nord-aurdal|nord-fron|nord-odal|norddal|nordkapp|davvenjarga|xn--davvenjrga-y4a|nordre-land|nordreisa|raisa|xn--risa-5na|nore-og-uvdal|notodden|naroy|xn--nry-yla5g|notteroy|xn--nttery-byae|odda|oksnes|xn--ksnes-uua|oppdal|oppegard|xn--oppegrd-ixa|orkdal|orland|xn--rland-uua|orskog|xn--rskog-uua|orsta|xn--rsta-fra|os.hedmark|os.hordaland|osen|osteroy|xn--ostery-fya|ostre-toten|xn--stre-toten-zcb|overhalla|ovre-eiker|xn--vre-eiker-k8a|oyer|xn--yer-zna|oygarden|xn--ygarden-p1a|oystre-slidre|xn--ystre-slidre-ujb|porsanger|porsangu|xn--porsgu-sta26f|porsgrunn|radoy|xn--rady-ira|rakkestad|rana|ruovat|randaberg|rauma|rendalen|rennebu|rennesoy|xn--rennesy-v1a|rindal|ringebu|ringerike|ringsaker|rissa|risor|xn--risr-ira|roan|rollag|rygge|ralingen|xn--rlingen-mxa|rodoy|xn--rdy-0nab|romskog|xn--rmskog-bya|roros|xn--rros-gra|rost|xn--rst-0na|royken|xn--ryken-vua|royrvik|xn--ryrvik-bya|rade|xn--rde-ula|salangen|siellak|saltdal|salat|xn--slt-elab|xn--slat-5na|samnanger|sande.more-og-romsdal|sande.xn--mre-og-romsdal-qqb|sande.vestfold|sandefjord|sandnes|sandoy|xn--sandy-yua|sarpsborg|sauda|sauherad|sel|selbu|selje|seljord|sigdal|siljan|sirdal|skaun|skedsmo|ski|skien|skiptvet|skjervoy|xn--skjervy-v1a|skierva|xn--skierv-uta|skjak|xn--skjk-soa|skodje|skanland|xn--sknland-fxa|skanit|xn--sknit-yqa|smola|xn--smla-hra|snillfjord|snasa|xn--snsa-roa|snoasa|snaase|xn--snase-nra|sogndal|sokndal|sola|solund|songdalen|sortland|spydeberg|stange|stavanger|steigen|steinkjer|stjordal|xn--stjrdal-s1a|stokke|stor-elvdal|stord|stordal|storfjord|omasvuotna|strand|stranda|stryn|sula|suldal|sund|sunndal|surnadal|sveio|svelvik|sykkylven|sogne|xn--sgne-gra|somna|xn--smna-gra|sondre-land|xn--sndre-land-0cb|sor-aurdal|xn--sr-aurdal-l8a|sor-fron|xn--sr-fron-q1a|sor-odal|xn--sr-odal-q1a|sor-varanger|xn--sr-varanger-ggb|matta-varjjat|xn--mtta-vrjjat-k7af|sorfold|xn--srfold-bya|sorreisa|xn--srreisa-q1a|sorum|xn--srum-gra|tana|deatnu|time|tingvoll|tinn|tjeldsund|dielddanuorri|tjome|xn--tjme-hra|tokke|tolga|torsken|tranoy|xn--trany-yua|tromso|xn--troms-zua|tromsa|romsa|trondheim|troandin|trysil|trana|xn--trna-woa|trogstad|xn--trgstad-r1a|tvedestrand|tydal|tynset|tysfjord|divtasvuodna|divttasvuotna|tysnes|tysvar|xn--tysvr-vra|tonsberg|xn--tnsberg-q1a|ullensaker|ullensvang|ulvik|utsira|vadso|xn--vads-jra|cahcesuolo|xn--hcesuolo-7ya35b|vaksdal|valle|vang|vanylven|vardo|xn--vard-jra|varggat|xn--vrggt-xqad|vefsn|vaapste|vega|vegarshei|xn--vegrshei-c0a|vennesla|verdal|verran|vestby|vestnes|vestre-slidre|vestre-toten|vestvagoy|xn--vestvgy-ixa6o|vevelstad|vik|vikna|vindafjord|volda|voss|varoy|xn--vry-yla5g|vagan|xn--vgan-qoa|voagat|vagsoy|xn--vgsy-qoa0j|vaga|xn--vg-yiab|valer.ostfold|xn--vler-qoa.xn--stfold-9xa|valer.hedmark|xn--vler-qoa.hedmark|co","np":"*","nr":"biz|info|gov|edu|org|net|com","nu":"merseine|mine|shacknet","nz":"ac|co|cri|geek|gen|govt|health|iwi|kiwi|maori|mil|xn--mori-qsa|net|org|parliament|school","om":"co|com|edu|gov|med|museum|net|org|pro","org":"ae|us|eu|al.eu|asso.eu|at.eu|au.eu|be.eu|bg.eu|ca.eu|cd.eu|ch.eu|cn.eu|cy.eu|cz.eu|de.eu|dk.eu|edu.eu|ee.eu|es.eu|fi.eu|fr.eu|gr.eu|hr.eu|hu.eu|ie.eu|il.eu|in.eu|int.eu|is.eu|it.eu|jp.eu|kr.eu|lt.eu|lu.eu|lv.eu|mc.eu|me.eu|mk.eu|mt.eu|my.eu|net.eu|ng.eu|nl.eu|no.eu|nz.eu|paris.eu|pl.eu|pt.eu|q-a.eu|ro.eu|ru.eu|se.eu|si.eu|sk.eu|tr.eu|uk.eu|us.eu|hk|za","pa":"ac|gob|com|org|sld|edu|net|ing|abo|med|nom","pe":"edu|gob|nom|mil|org|com|net","pf":"com|org|edu","pg":"*","ph":"com|net|org|gov|edu|ngo|mil|i","pk":"com|net|edu|org|fam|biz|web|gov|gob|gok|gon|gop|gos|info","pl":"com|net|org|aid|agro|atm|auto|biz|edu|gmina|gsm|info|mail|miasta|media|mil|nieruchomosci|nom|pc|powiat|priv|realestate|rel|sex|shop|sklep|sos|szkola|targi|tm|tourism|travel|turystyka|gov|ap.gov|ic.gov|is.gov|us.gov|kmpsp.gov|kppsp.gov|kwpsp.gov|psp.gov|wskr.gov|kwp.gov|mw.gov|ug.gov|um.gov|umig.gov|ugim.gov|upow.gov|uw.gov|starostwo.gov|pa.gov|po.gov|psse.gov|pup.gov|rzgw.gov|sa.gov|so.gov|sr.gov|wsa.gov|sko.gov|uzs.gov|wiih.gov|winb.gov|pinb.gov|wios.gov|witd.gov|wzmiuw.gov|piw.gov|wiw.gov|griw.gov|wif.gov|oum.gov|sdn.gov|zp.gov|uppo.gov|mup.gov|wuoz.gov|konsulat.gov|oirm.gov|augustow|babia-gora|bedzin|beskidy|bialowieza|bialystok|bielawa|bieszczady|boleslawiec|bydgoszcz|bytom|cieszyn|czeladz|czest|dlugoleka|elblag|elk|glogow|gniezno|gorlice|grajewo|ilawa|jaworzno|jelenia-gora|jgora|kalisz|kazimierz-dolny|karpacz|kartuzy|kaszuby|katowice|kepno|ketrzyn|klodzko|kobierzyce|kolobrzeg|konin|konskowola|kutno|lapy|lebork|legnica|lezajsk|limanowa|lomza|lowicz|lubin|lukow|malbork|malopolska|mazowsze|mazury|mielec|mielno|mragowo|naklo|nowaruda|nysa|olawa|olecko|olkusz|olsztyn|opoczno|opole|ostroda|ostroleka|ostrowiec|ostrowwlkp|pila|pisz|podhale|podlasie|polkowice|pomorze|pomorskie|prochowice|pruszkow|przeworsk|pulawy|radom|rawa-maz|rybnik|rzeszow|sanok|sejny|slask|slupsk|sosnowiec|stalowa-wola|skoczow|starachowice|stargard|suwalki|swidnica|swiebodzin|swinoujscie|szczecin|szczytno|tarnobrzeg|tgory|turek|tychy|ustka|walbrzych|warmia|warszawa|waw|wegrow|wielun|wlocl|wloclawek|wodzislaw|wolomin|wroclaw|zachpomor|zagan|zarow|zgora|zgorzelec|co|art|gliwice|krakow|poznan|wroc|zakopane|gda|gdansk|gdynia|med|sopot","pm":"","pn":"gov|co|org|edu|net","post":"","pr":"com|net|org|gov|edu|isla|pro|biz|info|name|est|prof|ac","pro":"aca|bar|cpa|jur|law|med|eng","ps":"edu|gov|sec|plo|com|org|net","pt":"net|gov|org|edu|int|publ|com|nome","pw":"co|ne|or|ed|go|belau","py":"com|coop|edu|gov|mil|net|org","qa":"com|edu|gov|mil|name|net|org|sch","re":"com|asso|nom","ro":"com|org|tm|nt|nom|info|rec|arts|firm|store|www","rs":"co|org|edu|ac|gov|in","ru":"ac|com|edu|int|net|org|pp|adygeya|altai|amur|arkhangelsk|astrakhan|bashkiria|belgorod|bir|bryansk|buryatia|cbg|chel|chelyabinsk|chita|chukotka|chuvashia|dagestan|dudinka|e-burg|grozny|irkutsk|ivanovo|izhevsk|jar|joshkar-ola|kalmykia|kaluga|kamchatka|karelia|kazan|kchr|kemerovo|khabarovsk|khakassia|khv|kirov|koenig|komi|kostroma|krasnoyarsk|kuban|kurgan|kursk|lipetsk|magadan|mari|mari-el|marine|mordovia|msk|murmansk|nalchik|nnov|nov|novosibirsk|nsk|omsk|orenburg|oryol|palana|penza|perm|ptz|rnd|ryazan|sakhalin|samara|saratov|simbirsk|smolensk|spb|stavropol|stv|surgut|tambov|tatarstan|tom|tomsk|tsaritsyn|tsk|tula|tuva|tver|tyumen|udm|udmurtia|ulan-ude|vladikavkaz|vladimir|vladivostok|volgograd|vologda|voronezh|vrn|vyatka|yakutia|yamal|yaroslavl|yekaterinburg|yuzhno-sakhalinsk|amursk|baikal|cmw|fareast|jamal|kms|k-uralsk|kustanai|kuzbass|magnitka|mytis|nakhodka|nkz|norilsk|oskol|pyatigorsk|rubtsovsk|snz|syzran|vdonsk|zgrad|gov|mil|test","rw":"gov|net|edu|ac|com|co|int|mil|gouv","sa":"com|net|org|gov|med|pub|edu|sch","sb":"com|edu|gov|net|org","sc":"com|gov|net|org|edu","sd":"com|net|org|edu|med|tv|gov|info","se":"a|ac|b|bd|brand|c|d|e|f|fh|fhsk|fhv|g|h|i|k|komforb|kommunalforbund|komvux|l|lanbib|m|n|naturbruksgymn|o|org|p|parti|pp|press|r|s|t|tm|u|w|x|y|z|com","sg":"com|net|org|gov|edu|per","sh":"com|net|gov|org|mil|*platform","si":"","sj":"","sk":"","sl":"com|net|edu|gov|org","sm":"","sn":"art|com|edu|gouv|org|perso|univ","so":"com|net|org","sr":"","st":"co|com|consulado|edu|embaixada|gov|mil|net|org|principe|saotome|store","su":"adygeya|arkhangelsk|balashov|bashkiria|bryansk|dagestan|grozny|ivanovo|kalmykia|kaluga|karelia|khakassia|krasnodar|kurgan|lenug|mordovia|msk|murmansk|nalchik|nov|obninsk|penza|pokrovsk|sochi|spb|togliatti|troitsk|tula|tuva|vladikavkaz|vladimir|vologda","sv":"com|edu|gob|org|red","sx":"gov","sy":"edu|gov|net|mil|com|org","sz":"co|ac|org","tc":"","td":"","tel":"","tf":"","tg":"","th":"ac|co|go|in|mi|net|or","tj":"ac|biz|co|com|edu|go|gov|int|mil|name|net|nic|org|test|web","tk":"","tl":"gov","tm":"com|co|org|net|nom|gov|mil|edu","tn":"com|ens|fin|gov|ind|intl|nat|net|org|info|perso|tourism|edunet|rnrt|rns|rnu|mincom|agrinet|defense|turen","to":"com|gov|net|org|edu|mil","tp":"","tr":"com|info|biz|net|org|web|gen|tv|av|dr|bbs|name|tel|gov|bel|pol|mil|k12|edu|kep|nc|gov.nc","travel":"","tt":"co|com|org|net|biz|info|pro|int|coop|jobs|mobi|travel|museum|aero|name|gov|edu","tv":"dyndns|better-than|on-the-web|worse-than","tw":"edu|gov|mil|com|net|org|idv|game|ebiz|club|xn--zf0ao64a|xn--uc0atv|xn--czrw28b","tz":"ac|co|go|hotel|info|me|mil|mobi|ne|or|sc|tv","ua":"com|edu|gov|in|net|org|cherkassy|cherkasy|chernigov|chernihiv|chernivtsi|chernovtsy|ck|cn|cr|crimea|cv|dn|dnepropetrovsk|dnipropetrovsk|dominic|donetsk|dp|if|ivano-frankivsk|kh|kharkiv|kharkov|kherson|khmelnitskiy|khmelnytskyi|kiev|kirovograd|km|kr|krym|ks|kv|kyiv|lg|lt|lugansk|lutsk|lv|lviv|mk|mykolaiv|nikolaev|od|odesa|odessa|pl|poltava|rivne|rovno|rv|sb|sebastopol|sevastopol|sm|sumy|te|ternopil|uz|uzhgorod|vinnica|vinnytsia|vn|volyn|yalta|zaporizhzhe|zaporizhzhia|zhitomir|zhytomyr|zp|zt|biz|co|pp","ug":"co|or|ac|sc|go|ne|com|org","uk":"ac|co|gov|ltd|me|net|nhs|org|plc|police|*sch","us":"dni|fed|isa|kids|nsn|ak|al|ar|as|az|ca|co|ct|dc|de|fl|ga|gu|hi|ia|id|il|in|ks|ky|la|ma|md|me|mi|mn|mo|ms|mt|nc|nd|ne|nh|nj|nm|nv|ny|oh|ok|or|pa|pr|ri|sc|sd|tn|tx|ut|vi|vt|va|wa|wi|wv|wy|k12.ak|k12.al|k12.ar|k12.as|k12.az|k12.ca|k12.co|k12.ct|k12.dc|k12.de|k12.fl|k12.ga|k12.gu|k12.ia|k12.id|k12.il|k12.in|k12.ks|k12.ky|k12.la|k12.ma|k12.md|k12.me|k12.mi|k12.mn|k12.mo|k12.ms|k12.mt|k12.nc|k12.ne|k12.nh|k12.nj|k12.nm|k12.nv|k12.ny|k12.oh|k12.ok|k12.or|k12.pa|k12.pr|k12.ri|k12.sc|k12.tn|k12.tx|k12.ut|k12.vi|k12.vt|k12.va|k12.wa|k12.wi|k12.wy|cc.ak|cc.al|cc.ar|cc.as|cc.az|cc.ca|cc.co|cc.ct|cc.dc|cc.de|cc.fl|cc.ga|cc.gu|cc.hi|cc.ia|cc.id|cc.il|cc.in|cc.ks|cc.ky|cc.la|cc.ma|cc.md|cc.me|cc.mi|cc.mn|cc.mo|cc.ms|cc.mt|cc.nc|cc.nd|cc.ne|cc.nh|cc.nj|cc.nm|cc.nv|cc.ny|cc.oh|cc.ok|cc.or|cc.pa|cc.pr|cc.ri|cc.sc|cc.sd|cc.tn|cc.tx|cc.ut|cc.vi|cc.vt|cc.va|cc.wa|cc.wi|cc.wv|cc.wy|lib.ak|lib.al|lib.ar|lib.as|lib.az|lib.ca|lib.co|lib.ct|lib.dc|lib.de|lib.fl|lib.ga|lib.gu|lib.hi|lib.ia|lib.id|lib.il|lib.in|lib.ks|lib.ky|lib.la|lib.ma|lib.md|lib.me|lib.mi|lib.mn|lib.mo|lib.ms|lib.mt|lib.nc|lib.nd|lib.ne|lib.nh|lib.nj|lib.nm|lib.nv|lib.ny|lib.oh|lib.ok|lib.or|lib.pa|lib.pr|lib.ri|lib.sc|lib.sd|lib.tn|lib.tx|lib.ut|lib.vi|lib.vt|lib.va|lib.wa|lib.wi|lib.wy|pvt.k12.ma|chtr.k12.ma|paroch.k12.ma|is-by|land-4-sale|stuff-4-sale","uy":"com|edu|gub|mil|net|org","uz":"co|com|net|org","va":"","vc":"com|net|org|gov|mil|edu","ve":"arts|co|com|e12|edu|firm|gob|gov|info|int|mil|net|org|rec|store|tec|web","vg":"","vi":"co|com|k12|net|org","vn":"com|net|org|edu|gov|int|ac|biz|info|name|pro|health","vu":"com|edu|net|org","wf":"","ws":"com|net|org|gov|edu|dyndns|mypets","yt":"","xn--mgbaam7a8h":"","xn--y9a3aq":"","xn--54b7fta0cc":"","xn--90ais":"","xn--fiqs8s":"","xn--fiqz9s":"","xn--lgbbat1ad8j":"","xn--wgbh1c":"","xn--node":"","xn--qxam":"","xn--j6w193g":"","xn--h2brj9c":"","xn--mgbbh1a71e":"","xn--fpcrj9c3d":"","xn--gecrj9c":"","xn--s9brj9c":"","xn--45brj9c":"","xn--xkc2dl3a5ee0h":"","xn--mgba3a4f16a":"","xn--mgba3a4fra":"","xn--mgbtx2b":"","xn--mgbayh7gpa":"","xn--3e0b707e":"","xn--80ao21a":"","xn--fzc2c9e2c":"","xn--xkc2al3hye2a":"","xn--mgbc0a9azcg":"","xn--d1alf":"","xn--l1acc":"","xn--mix891f":"","xn--mix082f":"","xn--mgbx4cd0ab":"","xn--mgb9awbf":"","xn--mgbai9azgqp6j":"","xn--mgbai9a5eva00b":"","xn--ygbi2ammx":"","xn--90a3ac":"xn--o1ac|xn--c1avg|xn--90azh|xn--d1at|xn--o1ach|xn--80au","xn--p1ai":"","xn--wgbl6a":"","xn--mgberp4a5d4ar":"","xn--mgberp4a5d4a87g":"","xn--mgbqly7c0a67fbc":"","xn--mgbqly7cvafr":"","xn--mgbpl2fh":"","xn--yfro4i67o":"","xn--clchc0ea0b2g2a9gcd":"","xn--ogbpf8fl":"","xn--mgbtf8fl":"","xn--o3cw4h":"","xn--pgbs0dh":"","xn--kpry57d":"","xn--kprw13d":"","xn--nnx388a":"","xn--j1amh":"","xn--mgb2ddes":"","xxx":"","ye":"*","za":"ac|agrica|alt|co|edu|gov|grondar|law|mil|net|ngo|nis|nom|org|school|tm|web","zm":"*","zw":"*","aaa":"","aarp":"","abarth":"","abb":"","abbott":"","abbvie":"","abc":"","able":"","abogado":"","abudhabi":"","academy":"","accenture":"","accountant":"","accountants":"","aco":"","active":"","actor":"","adac":"","ads":"","adult":"","aeg":"","aetna":"","afamilycompany":"","afl":"","africa":"","africamagic":"","agakhan":"","agency":"","aig":"","aigo":"","airbus":"","airforce":"","airtel":"","akdn":"","alfaromeo":"","alibaba":"","alipay":"","allfinanz":"","allstate":"","ally":"","alsace":"","alstom":"","americanexpress":"","americanfamily":"","amex":"","amfam":"","amica":"","amsterdam":"","analytics":"","android":"","anquan":"","anz":"","aol":"","apartments":"","app":"","apple":"","aquarelle":"","aramco":"","archi":"","army":"","arte":"","asda":"","associates":"","athleta":"","attorney":"","auction":"","audi":"","audible":"","audio":"","auspost":"","author":"","auto":"","autos":"","avianca":"","aws":"","axa":"","azure":"","baby":"","baidu":"","banamex":"","bananarepublic":"","band":"","bank":"","bar":"","barcelona":"","barclaycard":"","barclays":"","barefoot":"","bargains":"","baseball":"","basketball":"","bauhaus":"","bayern":"","bbc":"","bbt":"","bbva":"","bcg":"","bcn":"","beats":"","beer":"","bentley":"","berlin":"","best":"","bestbuy":"","bet":"","bharti":"","bible":"","bid":"","bike":"","bing":"","bingo":"","bio":"","black":"","blackfriday":"","blanco":"","blockbuster":"","blog":"","bloomberg":"","blue":"","bms":"","bmw":"","bnl":"","bnpparibas":"","boats":"","boehringer":"","bofa":"","bom":"","bond":"","boo":"","book":"","booking":"","boots":"","bosch":"","bostik":"","bot":"","boutique":"","bradesco":"","bridgestone":"","broadway":"","broker":"","brother":"","brussels":"","budapest":"","bugatti":"","build":"","builders":"","business":"","buy":"","buzz":"","bzh":"","cab":"","cafe":"","cal":"","call":"","calvinklein":"","camera":"","camp":"","cancerresearch":"","canon":"","capetown":"","capital":"","capitalone":"","car":"","caravan":"","cards":"","care":"","career":"","careers":"","cars":"","cartier":"","casa":"","case":"","caseih":"","cash":"","casino":"","catering":"","catholic":"","cba":"","cbn":"","cbre":"","cbs":"","ceb":"","center":"","ceo":"","cern":"","cfa":"","cfd":"","chanel":"","channel":"","chase":"","chat":"","cheap":"","chintai":"","chloe":"","christmas":"","chrome":"","chrysler":"","church":"","cipriani":"","circle":"","cisco":"","citadel":"","citi":"","citic":"","city":"","cityeats":"","claims":"","cleaning":"","click":"","clinic":"","clinique":"","clothing":"","cloud":"","club":"","clubmed":"","coach":"","codes":"","coffee":"","college":"","cologne":"","comcast":"","commbank":"","community":"","company":"","compare":"","computer":"","comsec":"","condos":"","construction":"","consulting":"","contact":"","contractors":"","cooking":"","cookingchannel":"","cool":"","corsica":"","country":"","coupon":"","coupons":"","courses":"","credit":"","creditcard":"","creditunion":"","cricket":"","crown":"","crs":"","cruises":"","csc":"","cuisinella":"","cymru":"","cyou":"","dabur":"","dad":"","dance":"","date":"","dating":"","datsun":"","day":"","dclk":"","dds":"","deal":"","dealer":"","deals":"","degree":"","delivery":"","dell":"","deloitte":"","delta":"","democrat":"","dental":"","dentist":"","desi":"","design":"","dev":"","dhl":"","diamonds":"","diet":"","digital":"","direct":"","directory":"","discount":"","discover":"","dish":"","diy":"","dnp":"","docs":"","dodge":"","dog":"","doha":"","domains":"","doosan":"","dot":"","download":"","drive":"","dstv":"","dtv":"","dubai":"","duck":"","dunlop":"","duns":"","dupont":"","durban":"","dvag":"","dwg":"","earth":"","eat":"","edeka":"","education":"","email":"","emerck":"","emerson":"","energy":"","engineer":"","engineering":"","enterprises":"","epost":"","epson":"","equipment":"","ericsson":"","erni":"","esq":"","estate":"","esurance":"","etisalat":"","eurovision":"","eus":"","events":"","everbank":"","exchange":"","expert":"","exposed":"","express":"","extraspace":"","fage":"","fail":"","fairwinds":"","faith":"","family":"","fan":"","fans":"","farm":"","farmers":"","fashion":"","fast":"","fedex":"","feedback":"","ferrari":"","ferrero":"","fiat":"","fidelity":"","fido":"","film":"","final":"","finance":"","financial":"","fire":"","firestone":"","firmdale":"","fish":"","fishing":"","fit":"","fitness":"","flickr":"","flights":"","flir":"","florist":"","flowers":"","flsmidth":"","fly":"","foo":"","foodnetwork":"","football":"","ford":"","forex":"","forsale":"","forum":"","foundation":"","fox":"","fresenius":"","frl":"","frogans":"","frontdoor":"","frontier":"","ftr":"","fujitsu":"","fujixerox":"","fund":"","furniture":"","futbol":"","fyi":"","gal":"","gallery":"","gallo":"","gallup":"","game":"","games":"","gap":"","garden":"","gbiz":"","gdn":"","gea":"","gent":"","genting":"","george":"","ggee":"","gift":"","gifts":"","gives":"","giving":"","glade":"","glass":"","gle":"","global":"","globo":"","gmail":"","gmo":"","gmx":"","godaddy":"","gold":"","goldpoint":"","golf":"","goo":"","goodhands":"","goodyear":"","goog":"","google":"","gop":"","got":"","gotv":"","grainger":"","graphics":"","gratis":"","green":"","gripe":"","group":"","guardian":"","gucci":"","guge":"","guide":"","guitars":"","guru":"","hamburg":"","hangout":"","haus":"","hbo":"","hdfc":"","hdfcbank":"","health":"","healthcare":"","help":"","helsinki":"","here":"","hermes":"","hgtv":"","hiphop":"","hisamitsu":"","hitachi":"","hiv":"","hkt":"","hockey":"","holdings":"","holiday":"","homedepot":"","homegoods":"","homes":"","homesense":"","honda":"","honeywell":"","horse":"","host":"","hosting":"","hot":"","hoteles":"","hotmail":"","house":"","how":"","hsbc":"","htc":"","hughes":"","hyatt":"","hyundai":"","ibm":"","icbc":"","ice":"","icu":"","ieee":"","ifm":"","iinet":"","ikano":"","imamat":"","imdb":"","immo":"","immobilien":"","industries":"","infiniti":"","ing":"","ink":"","institute":"","insurance":"","insure":"","intel":"","international":"","intuit":"","investments":"","ipiranga":"","irish":"","iselect":"","ismaili":"","ist":"","istanbul":"","itau":"","itv":"","iveco":"","iwc":"","jaguar":"","java":"","jcb":"","jcp":"","jeep":"","jetzt":"","jewelry":"","jio":"","jlc":"","jll":"","jmp":"","jnj":"","joburg":"","jot":"","joy":"","jpmorgan":"","jprs":"","juegos":"","juniper":"","kaufen":"","kddi":"","kerryhotels":"","kerrylogistics":"","kerryproperties":"","kfh":"","kia":"","kim":"","kinder":"","kindle":"","kitchen":"","kiwi":"","koeln":"","komatsu":"","kosher":"","kpmg":"","kpn":"","krd":"","kred":"","kuokgroup":"","kyknet":"","kyoto":"","lacaixa":"","ladbrokes":"","lamborghini":"","lamer":"","lancaster":"","lancia":"","lancome":"","land":"","landrover":"","lanxess":"","lasalle":"","lat":"","latino":"","latrobe":"","law":"","lawyer":"","lds":"","lease":"","leclerc":"","lefrak":"","legal":"","lego":"","lexus":"","lgbt":"","liaison":"","lidl":"","life":"","lifeinsurance":"","lifestyle":"","lighting":"","like":"","lilly":"","limited":"","limo":"","lincoln":"","linde":"","link":"","lipsy":"","live":"","living":"","lixil":"","loan":"","loans":"","locker":"","locus":"","loft":"","lol":"","london":"","lotte":"","lotto":"","love":"","lpl":"","lplfinancial":"","ltd":"","ltda":"","lundbeck":"","lupin":"","luxe":"","luxury":"","macys":"","madrid":"","maif":"","maison":"","makeup":"","man":"","management":"","mango":"","market":"","marketing":"","markets":"","marriott":"","marshalls":"","maserati":"","mattel":"","mba":"","mcd":"","mcdonalds":"","mckinsey":"","med":"","media":"","meet":"","melbourne":"","meme":"","memorial":"","men":"","menu":"","meo":"","metlife":"","miami":"","microsoft":"","mini":"","mint":"","mit":"","mitsubishi":"","mlb":"","mls":"","mma":"","mnet":"","mobily":"","moda":"","moe":"","moi":"","mom":"","monash":"","money":"","monster":"","montblanc":"","mopar":"","mormon":"","mortgage":"","moscow":"","moto":"","motorcycles":"","mov":"","movie":"","movistar":"","msd":"","mtn":"","mtpc":"","mtr":"","multichoice":"","mutual":"","mutuelle":"","mzansimagic":"","nab":"","nadex":"","nagoya":"","naspers":"","nationwide":"","natura":"","navy":"","nba":"","nec":"","netbank":"","netflix":"","network":"","neustar":"","new":"","newholland":"","news":"","next":"","nextdirect":"","nexus":"","nfl":"","ngo":"","nhk":"","nico":"","nike":"","nikon":"","ninja":"","nissan":"","nissay":"","nokia":"","northwesternmutual":"","norton":"","now":"","nowruz":"","nowtv":"","nra":"","nrw":"","ntt":"","nyc":"","obi":"","observer":"","off":"","office":"","okinawa":"","olayan":"","olayangroup":"","oldnavy":"","ollo":"","omega":"","one":"","ong":"","onl":"","online":"","onyourside":"","ooo":"","open":"","oracle":"","orange":"","organic":"","orientexpress":"","origins":"","osaka":"","otsuka":"","ott":"","ovh":"","page":"","pamperedchef":"","panasonic":"","panerai":"","paris":"","pars":"","partners":"","parts":"","party":"","passagens":"","pay":"","payu":"","pccw":"","pet":"","pfizer":"","pharmacy":"","philips":"","photo":"","photography":"","photos":"","physio":"","piaget":"","pics":"","pictet":"","pictures":"","pid":"","pin":"","ping":"","pink":"","pioneer":"","pizza":"","place":"","play":"","playstation":"","plumbing":"","plus":"","pnc":"","pohl":"","poker":"","politie":"","porn":"","pramerica":"","praxi":"","press":"","prime":"","prod":"","productions":"","prof":"","progressive":"","promo":"","properties":"","property":"","protection":"","pru":"","prudential":"","pub":"","pwc":"","qpon":"","quebec":"","quest":"","qvc":"","racing":"","raid":"","read":"","realestate":"","realtor":"","realty":"","recipes":"","red":"","redstone":"","redumbrella":"","rehab":"","reise":"","reisen":"","reit":"","reliance":"","ren":"","rent":"","rentals":"","repair":"","report":"","republican":"","rest":"","restaurant":"","review":"","reviews":"","rexroth":"","rich":"","richardli":"","ricoh":"","rightathome":"","ril":"","rio":"","rip":"","rocher":"","rocks":"","rodeo":"","rogers":"","room":"","rsvp":"","ruhr":"","run":"","rwe":"","ryukyu":"","saarland":"","safe":"","safety":"","sakura":"","sale":"","salon":"","samsclub":"","samsung":"","sandvik":"","sandvikcoromant":"","sanofi":"","sap":"","sapo":"","sarl":"","sas":"","save":"","saxo":"","sbi":"","sbs":"","sca":"","scb":"","schaeffler":"","schmidt":"","scholarships":"","school":"","schule":"","schwarz":"","science":"","scjohnson":"","scor":"","scot":"","seat":"","secure":"","security":"","seek":"","select":"","sener":"","services":"","ses":"","seven":"","sew":"","sex":"","sexy":"","sfr":"","shangrila":"","sharp":"","shaw":"","shell":"","shia":"","shiksha":"","shoes":"","shouji":"","show":"","showtime":"","shriram":"","silk":"","sina":"","singles":"","site":"","ski":"","skin":"","sky":"","skype":"","sling":"","smart":"","smile":"","sncf":"","soccer":"","social":"","softbank":"","software":"","sohu":"","solar":"","solutions":"","song":"","sony":"","soy":"","space":"","spiegel":"","spot":"","spreadbetting":"","srl":"","srt":"","stada":"","staples":"","star":"","starhub":"","statebank":"","statefarm":"","statoil":"","stc":"","stcgroup":"","stockholm":"","storage":"","store":"","studio":"","study":"","style":"","sucks":"","supersport":"","supplies":"","supply":"","support":"","surf":"","surgery":"","suzuki":"","swatch":"","swiftcover":"","swiss":"","sydney":"","symantec":"","systems":"","tab":"","taipei":"","talk":"","taobao":"","target":"","tatamotors":"","tatar":"","tattoo":"","tax":"","taxi":"","tci":"","tdk":"","team":"","tech":"","technology":"","telecity":"","telefonica":"","temasek":"","tennis":"","teva":"","thd":"","theater":"","theatre":"","theguardian":"","tiaa":"","tickets":"","tienda":"","tiffany":"","tips":"","tires":"","tirol":"","tjmaxx":"","tjx":"","tkmaxx":"","tmall":"","today":"","tokyo":"","tools":"","top":"","toray":"","toshiba":"","total":"","tours":"","town":"","toyota":"","toys":"","trade":"","trading":"","training":"","travelchannel":"","travelers":"","travelersinsurance":"","trust":"","trv":"","tube":"","tui":"","tunes":"","tushu":"","tvs":"","ubank":"","ubs":"","uconnect":"","unicom":"","university":"","uno":"","uol":"","ups":"","vacations":"","vana":"","vanguard":"","vegas":"","ventures":"","verisign":"","versicherung":"","vet":"","viajes":"","video":"","vig":"","viking":"","villas":"","vin":"","vip":"","virgin":"","visa":"","vision":"","vista":"","vistaprint":"","viva":"","vivo":"","vlaanderen":"","vodka":"","volkswagen":"","vote":"","voting":"","voto":"","voyage":"","vuelos":"","wales":"","walmart":"","walter":"","wang":"","wanggou":"","warman":"","watch":"","watches":"","weather":"","weatherchannel":"","webcam":"","weber":"","website":"","wed":"","wedding":"","weibo":"","weir":"","whoswho":"","wien":"","wiki":"","williamhill":"","win":"","windows":"","wine":"","winners":"","wme":"","wolterskluwer":"","woodside":"","work":"","works":"","world":"","wow":"","wtc":"","wtf":"","xbox":"","xerox":"","xfinity":"","xihuan":"","xin":"","xn--11b4c3d":"","xn--1ck2e1b":"","xn--1qqw23a":"","xn--30rr7y":"","xn--3bst00m":"","xn--3ds443g":"","xn--3oq18vl8pn36a":"","xn--3pxu8k":"","xn--42c2d9a":"","xn--45q11c":"","xn--4gbrim":"","xn--4gq48lf9j":"","xn--55qw42g":"","xn--55qx5d":"","xn--5su34j936bgsg":"","xn--5tzm5g":"","xn--6frz82g":"","xn--6qq986b3xl":"","xn--80adxhks":"","xn--80aqecdr1a":"","xn--80asehdb":"","xn--80aswg":"","xn--8y0a063a":"","xn--9dbq2a":"","xn--9et52u":"","xn--9krt00a":"","xn--b4w605ferd":"","xn--bck1b9a5dre4c":"","xn--c1avg":"","xn--c2br7g":"","xn--cck2b3b":"","xn--cg4bki":"","xn--czr694b":"","xn--czrs0t":"","xn--czru2d":"","xn--d1acj3b":"","xn--eckvdtc9d":"","xn--efvy88h":"","xn--estv75g":"","xn--fct429k":"","xn--fhbei":"","xn--fiq228c5hs":"","xn--fiq64b":"","xn--fjq720a":"","xn--flw351e":"","xn--fzys8d69uvgm":"","xn--g2xx48c":"","xn--gckr3f0f":"","xn--gk3at1e":"","xn--hxt814e":"","xn--i1b6b1a6a2e":"","xn--imr513n":"","xn--io0a7i":"","xn--j1aef":"","xn--jlq61u9w7b":"","xn--jvr189m":"","xn--kcrx77d1x4a":"","xn--kpu716f":"","xn--kput3i":"","xn--mgba3a3ejt":"","xn--mgba7c0bbn0a":"","xn--mgbaakc7dvf":"","xn--mgbab2bd":"","xn--mgbb9fbpob":"","xn--mgbca7dzdo":"","xn--mgbi4ecexp":"","xn--mgbt3dhd":"","xn--mk1bu44c":"","xn--mxtq1m":"","xn--ngbc5azd":"","xn--ngbe9e0a":"","xn--nqv7f":"","xn--nqv7fs00ema":"","xn--nyqy26a":"","xn--p1acf":"","xn--pbt977c":"","xn--pssy2u":"","xn--q9jyb4c":"","xn--qcka1pmc":"","xn--rhqv96g":"","xn--rovu88b":"","xn--ses554g":"","xn--t60b56a":"","xn--tckwe":"","xn--tiq49xqyj":"","xn--unup4y":"","xn--vermgensberater-ctb":"","xn--vermgensberatung-pwb":"","xn--vhquv":"","xn--vuq861b":"","xn--w4r85el8fhu5dnra":"","xn--w4rs40l":"","xn--xhq521b":"","xn--zfr164b":"","xperia":"","xyz":"","yachts":"","yahoo":"","yamaxun":"","yandex":"","yodobashi":"","yoga":"","yokohama":"","you":"","youtube":"","yun":"","zappos":"","zara":"","zero":"","zip":"","zippo":"","zone":"","zuerich":""}
},{}],"tldjs/index.js":[function(require,module,exports){
"use strict";

var tld = require('./lib/tld.js').init();
tld.rules = require('./rules.json');

module.exports = tld;

},{"./lib/tld.js":8,"./rules.json":9}]},{},[])("tldjs/index.js")
});