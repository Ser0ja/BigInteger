/*jslint plusplus: true, vars: true, indent: 2 */

(function (exports) {
  "use strict";

  // BigInteger.js
  // Available under Public Domain
  // https://github.com/Yaffle/BigInteger/

  // For implementation details, see "The Handbook of Applied Cryptography"
  // http://www.cacr.math.uwaterloo.ca/hac/about/chap14.pdf

  var parseInteger = function (s, from, to, radix) {
    var i = from - 1;
    var n = 0;
    var y = radix < 10 ? radix : 10;
    while (++i < to) {
      var code = s.charCodeAt(i);
      var v = code - 48;
      if (v < 0 || y <= v) {
        v = 10 - 65 + code;
        if (v < 10 || radix <= v) {
          v = 10 - 97 + code;
          if (v < 10 || radix <= v) {
            throw new RangeError();
          }
        }
      }
      n = n * radix + v;
    }
    return n;
  };

  var createArray = function (length) {
    var x = new Array(length);
    var i = -1;
    while (++i < length) {
      x[i] = 0;
    }
    return x;
  };

  var pow = function (x, n) {
    var accumulator = 1;
    while (n !== 1) {
      var t = Math.floor(n / 2);
      if (t * 2 !== n) {
        accumulator *= x;
      }
      x *= x;
      n = t;
    }
    return accumulator * x;
  };

  var sign = function (x) {
    return (x < 0 ? -1 : (x > 0 ? +1 : 0 * x));
  };

  var abs = function (x) {
    return (x < 0 ? (0 - x) : 0 + x);
  };

  var log2 = function (x) {
    return Math.log(x) / Math.log(2);
  };

  var epsilon = 1 / 4503599627370496;
  while ((1 + epsilon / 2) !== 1) {
    epsilon /= 2;
  }

  var BASE = 2 / epsilon;
  var LOG2BASE = Math.floor(log2(BASE) + 0.5);
  var SPLIT = 67108864 * pow(2, Math.floor((LOG2BASE - 53) / 2) + 1) + 1;

  var trunc = function (x) {
    var v = 0;
    if (x > +0) {
      if (x < +1073741823) {
        return +Math.floor(+x);
      }
      //if (x > +BASE) {
      //  return x;
      //}
      v = (x - BASE) + BASE;
      return v > x ? v - 1 : v;
    }
    if (x < -0) {
      if (x > -1073741823) {
        return -Math.floor(-x);
      }
      //if (x < -BASE) {
      //  return x;
      //}
      v = (x + BASE) - BASE;
      return v < x ? v + 1 : v;
    }
    return x;
  };

  var performMultiplication = function (carry, a, b, result, index) {
    // Veltkamp-Dekker's algorithm
    // see http://web.mit.edu/tabbott/Public/quaddouble-debian/qd-2.3.4-old/docs/qd.pdf

    var at = SPLIT * a;
    var ahi = at - (at - a);
    var alo = a - ahi;
    var bt = SPLIT * b;
    var bhi = bt - (bt - b);
    var blo = b - bhi;
    var product = a * b;
    var error = ((ahi * bhi - product) + ahi * blo + alo * bhi) + alo * blo;

    // with FMA:
    // var product = a * b;
    // var error = Math.fma(a, b, -product);

    var hi = trunc(product / BASE);
    var lo = product - hi * BASE + error;

    if (lo < 0) {
      lo += BASE;
      hi -= 1;
    }

    // + carry
    lo += carry - BASE;
    if (lo < 0) {
      lo += BASE;
    } else {
      hi += 1;
    }

    result[index] = lo;
    return hi;
  };

  var performDivision = function (a, b, divisor, result, index) {
    // assertion
    if (a >= divisor) {
      throw new RangeError();
    }

    var p = a * BASE;
    var y = p / divisor;
    var r = p % divisor;
    var q = trunc(y);
    if (y === q && r > divisor - r) {
      q -= 1;
    }
    r += b - divisor;
    if (r < 0) {
      r += divisor;
    } else {
      q += 1;
    }
    y = trunc(r / divisor);
    r -= y * divisor;
    q += y;

    result[index] = q;
    return r;
  };

  var checkRadix = function (radix) {
    if (radix !== Number(radix) || Math.floor(radix) !== radix || radix < 2 || radix > 36) {
      throw new RangeError("radix argument must be an integer between 2 and 36");
    }
  };

  var divideBySmall = function (magnitude, length, lambda) {
    var c = 0;
    var i = length;
    while (--i >= 0) {
      c = performDivision(c, magnitude[i], lambda, magnitude, i);
    }
    return c;
  };

  var multiplyBySmall = function (c, magnitude, length, lambda) {
    var i = -1;
    while (++i < length) {
      c = performMultiplication(c, magnitude[i], lambda, magnitude, i);
    }
    magnitude[length] = c;
  };

  var parseBigInteger = function (s, radix) {
    if (radix === undefined) {
      radix = 10;
    }
    checkRadix(radix);
    var length = s.length;
    if (length === 0) {
      throw new RangeError();
    }
    var sign = 1;
    var signCharCode = s.charCodeAt(0);
    var from = 0;
    if (signCharCode === 43) { // "+"
      from = 1;
    }
    if (signCharCode === 45) { // "-"
      from = 1;
      sign = -1;
    }

    length -= from;
    if (length === 0) {
      throw new RangeError();
    }
    var groupLength = Math.floor(LOG2BASE / log2(radix) - 1 / 512);
    if (length <= groupLength) {
      var value = parseInteger(s, from, from + length, radix);
      return sign < 0 ? 0 - value : value;
    }
    var groupRadix = pow(radix, groupLength);
    var size = Math.floor((length - 1) / groupLength) + 1;

    var magnitude = createArray(size);
    var k = size;
    var i = length;
    while (i > 0) {
      k -= 1;
      magnitude[k] = parseInteger(s, from + (i > groupLength ? i - groupLength : 0), from + i, radix);
      i -= groupLength;
    }

    var j = -1;
    while (++j < size) {
      multiplyBySmall(magnitude[j], magnitude, j, groupRadix);
    }

    while (size > 0 && magnitude[size - 1] === 0) {
      size -= 1;
    }

    return createBigInteger(size === 0 ? 0 : sign, magnitude, size);
  };

  function BigInteger(signum, magnitude, length) {
    this.signum = signum;
    this.magnitude = magnitude;
    this.length = length;
  }

  var createBigInteger = function (signum, magnitude, length) {
    return length < 2 ? (length === 0 ? 0 : (signum < 0 ? 0 - magnitude[0] : magnitude[0])) : new BigInteger(signum, magnitude, length);
  };

  var compareMagnitude = function (aMagnitude, aLength, aValue, bMagnitude, bLength, bValue) {
    if (aLength !== bLength) {
      return aLength < bLength ? -1 : +1;
    }
    var i = aLength;
    while (--i >= 0) {
      if ((aMagnitude === undefined ? aValue : aMagnitude[i]) !== (bMagnitude === undefined ? bValue : bMagnitude[i])) {
        return (aMagnitude === undefined ? aValue : aMagnitude[i]) < (bMagnitude === undefined ? bValue : bMagnitude[i]) ? -1 : +1;
      }
    }
    return 0;
  };

  var compareTo = function (aSignum, aMagnitude, aLength, aValue, bSignum, bMagnitude, bLength, bValue) {
    if (aSignum === bSignum) {
      var c = compareMagnitude(aMagnitude, aLength, aValue, bMagnitude, bLength, bValue);
      return aSignum < 0 ? 0 - c : c; // positive zero will be returned for c === 0
    }
    if (aSignum === 0) {
      return 0 - bSignum;
    }
    return aSignum;
  };

  var addNext = function (aSignum, aMagnitude, aLength, aValue, bSignum, bMagnitude, bLength, bValue) {
    // |a| <= |b|
    if (aSignum === 0) {
      return bMagnitude === undefined ? (bSignum < 0 ? 0 - bValue : bValue) : createBigInteger(bSignum, bMagnitude, bLength);
    }
    var subtract = false;
    if (aSignum !== bSignum) {
      subtract = true;
      if (aLength === bLength) {
        while (bLength > 0 && (aMagnitude === undefined ? aValue : aMagnitude[bLength - 1]) === (bMagnitude === undefined ? bValue : bMagnitude[bLength - 1])) {
          bLength -= 1;
        }
      }
      if (bLength === 0) { // a === (-b)
        return createBigInteger(0, createArray(0), 0);
      }
    }
    // result !== 0
    var resultLength = bLength + (subtract ? 0 : 1);
    var result = createArray(resultLength);
    var i = -1;
    var c = 0;
    while (++i < bLength) {
      var aDigit = i < aLength ? (aMagnitude === undefined ? aValue : aMagnitude[i]) : 0;
      c += (bMagnitude === undefined ? bValue : bMagnitude[i]) + (subtract ? 0 - aDigit : aDigit - BASE);
      if (c < 0) {
        result[i] = BASE + c;
        c = subtract ? -1 : 0;
      } else {
        result[i] = c;
        c = subtract ? 0 : +1;
      }
    }
    if (c !== 0) {
      result[bLength] = c;
    }
    while (resultLength > 0 && result[resultLength - 1] === 0) {
      resultLength -= 1;
    }
    return createBigInteger(bSignum, result, resultLength);
  };

  var add = function (aSignum, aMagnitude, aLength, aValue, bSignum, bMagnitude, bLength, bValue) {
    var z = compareMagnitude(aMagnitude, aLength, aValue, bMagnitude, bLength, bValue);
    if (z > 0) {
      return addNext(bSignum, bMagnitude, bLength, bValue, aSignum, aMagnitude, aLength, aValue);
    }
    return addNext(aSignum, aMagnitude, aLength, aValue, bSignum, bMagnitude, bLength, bValue);
  };

  var multiply = function (aSignum, aMagnitude, aLength, aValue, bSignum, bMagnitude, bLength, bValue) {
    if (aLength === 0 || bLength === 0) {
      return createBigInteger(0, createArray(0), 0);
    }
    var resultSign = aSignum < 0 ? 0 - bSignum : bSignum;
    if (aLength === 1 && (aMagnitude === undefined ? aValue : aMagnitude[0]) === 1) {
      return bMagnitude === undefined ? (resultSign < 0 ? 0 - bValue : bValue) : createBigInteger(resultSign, bMagnitude, bLength);
    }
    if (bLength === 1 && (bMagnitude === undefined ? bValue : bMagnitude[0]) === 1) {
      return aMagnitude === undefined ? (resultSign < 0 ? 0 - aValue : aValue) : createBigInteger(resultSign, aMagnitude, aLength);
    }
    var resultLength = aLength + bLength;
    var result = createArray(resultLength);
    var i = -1;
    while (++i < bLength) {
      var c = 0;
      var j = -1;
      while (++j < aLength) {
        var carry = 0;
        c += result[j + i] - BASE;
        if (c >= 0) {
          carry = 1;
        } else {
          c += BASE;
        }
        c = carry + performMultiplication(c, aMagnitude === undefined ? aValue : aMagnitude[j], bMagnitude === undefined ? bValue : bMagnitude[i], result, j + i);
      }
      result[aLength + i] = c;
    }
    while (resultLength > 0 && result[resultLength - 1] === 0) {
      resultLength -= 1;
    }
    return createBigInteger(resultSign, result, resultLength);
  };

  var divideAndRemainder = function (aSignum, aMagnitude, aLength, aValue, bSignum, bMagnitude, bLength, bValue, divide) {
    if (bLength === 0) {
      throw new RangeError();
    }
    if (aLength === 0) {
      return createBigInteger(0, createArray(0), 0);
    }
    var quotientSign = aSignum < 0 ? 0 - bSignum : bSignum;
    if (bLength === 1 && (bMagnitude === undefined ? bValue : bMagnitude[0]) === 1) {
      if (divide) {
        return aMagnitude === undefined ? (quotientSign < 0 ? 0 - aValue : aValue) : createBigInteger(quotientSign, aMagnitude, aLength);
      }
      return createBigInteger(0, createArray(0), 0);
    }

    var divisorOffset = aLength + 1; // `+ 1` for extra digit in case of normalization
    var divisorAndRemainder = createArray(divisorOffset + bLength + 1); // `+ 1` to avoid `index < length` checks
    var divisor = divisorAndRemainder;
    var remainder = divisorAndRemainder;
    var n = -1;
    while (++n < aLength) {
      remainder[n] = aMagnitude === undefined ? aValue : aMagnitude[n];
    }
    var m = -1;
    while (++m < bLength) {
      divisor[divisorOffset + m] = bMagnitude === undefined ? bValue : bMagnitude[m];
    }

    var top = divisor[divisorOffset + bLength - 1];

    // normalization
    var lambda = 1;
    if (bLength > 1) {
      lambda = trunc(BASE / (top + 1));
      if (lambda > 1) {
        multiplyBySmall(0, divisorAndRemainder, divisorOffset + bLength, lambda);
        top = divisor[divisorOffset + bLength - 1];
      }
      // assertion
      if (top < trunc(BASE / 2)) {
        throw new RangeError();
      }
    }

    var shift = aLength - bLength + 1;
    if (shift < 0) {
      shift = 0;
    }
    var quotient = undefined;
    var quotientLength = 0;

    var i = shift;
    while (--i >= 0) {
      var t = bLength + i;
      var q = BASE - 1;
      var tmp = remainder[t];
      if (tmp !== top) {
        performDivision(remainder[t], remainder[t - 1], top, remainder, t);
        q = remainder[t];
        remainder[t] = tmp;
      }

      var ax = 0;
      var bx = 0;
      var j = i - 1;
      while (++j <= t) {
        var rj = remainder[j];
        bx = performMultiplication(bx, q, divisor[divisorOffset + j - i], remainder, j);
        ax += rj - remainder[j];
        if (ax < 0) {
          remainder[j] = BASE + ax;
          ax = -1;
        } else {
          remainder[j] = ax;
          ax = 0;
        }
      }
      while (ax !== 0) {
        q -= 1;
        var c = 0;
        var k = i - 1;
        while (++k <= t) {
          c += remainder[k] - BASE + divisor[divisorOffset + k - i];
          if (c < 0) {
            remainder[k] = BASE + c;
            c = 0;
          } else {
            remainder[k] = c;
            c = +1;
          }
        }
        ax += c;
      }
      if (divide && q !== 0) {
        if (quotientLength === 0) {
          quotientLength = i + 1;
          quotient = createArray(quotientLength);
        }
        quotient[i] = q;
      }
    }

    if (divide) {
      if (quotientLength === 0) {
        return createBigInteger(0, createArray(0), 0);
      }
      return createBigInteger(quotientSign, quotient, quotientLength);
    }

    var remainderLength = aLength + 1;
    if (lambda > 1) {
      if (divideBySmall(remainder, remainderLength, lambda) !== 0) {
        // assertion
        throw new RangeError();
      }
    }
    while (remainderLength > 0 && remainder[remainderLength - 1] === 0) {
      remainderLength -= 1;
    }
    if (remainderLength === 0) {
      return createBigInteger(0, createArray(0), 0);
    }
    var result = createArray(remainderLength);
    var o = -1;
    while (++o < remainderLength) {
      result[o] = remainder[o];
    }
    return createBigInteger(aSignum, result, remainderLength);
  };

  var toString = function (signum, magnitude, length, radix) {
    var result = signum < 0 ? "-" : "";

    var remainderLength = length;
    if (remainderLength === 0) {
      return "0";
    }
    if (remainderLength === 1) {
      result += magnitude[0].toString(radix);
      return result;
    }
    var groupLength = Math.floor(LOG2BASE / log2(radix) - 1 / 512);
    var groupRadix = pow(radix, groupLength);
    var size = remainderLength + Math.floor((remainderLength - 1) / groupLength) + 1;
    var remainder = createArray(size);
    var n = -1;
    while (++n < remainderLength) {
      remainder[n] = magnitude[n];
    }

    var k = size;
    while (remainderLength !== 0) {
      var q = divideBySmall(remainder, remainderLength, groupRadix);
      while (remainderLength > 0 && remainder[remainderLength - 1] === 0) {
        remainderLength -= 1;
      }
      k -= 1;
      remainder[k] = q;
    }
    result += remainder[k].toString(radix);
    while (++k < size) {
      var t = remainder[k].toString(radix);
      var j = groupLength - t.length;
      while (--j >= 0) {
        result += "0";
      }
      result += t;
    }
    return result;
  };

  var compareToBigIntegerBigInteger = function (x, y) {
    return compareTo(x.signum, x.magnitude, x.length, 0, y.signum, y.magnitude, y.length, 0);
  };

  var negateBigInteger = function (x) {
    return createBigInteger(0 - x.signum, x.magnitude, x.length);
  };

  var addBigIntegerBigInteger = function (x, y) {
    return add(x.signum, x.magnitude, x.length, 0, y.signum, y.magnitude, y.length, 0);
  };

  var subtractBigIntegerBigInteger = function (x, y) {
    return add(x.signum, x.magnitude, x.length, 0, 0 - y.signum, y.magnitude, y.length, 0);
  };

  var multiplyBigIntegerBigInteger = function (x, y) {
    return multiply(x.signum, x.magnitude, x.length, 0, y.signum, y.magnitude, y.length, 0);
  };

  var divideBigIntegerBigInteger = function (x, y) {
    return divideAndRemainder(x.signum, x.magnitude, x.length, 0, y.signum, y.magnitude, y.length, 0, true);
  };

  var remainderBigIntegerBigInteger = function (x, y) {
    return divideAndRemainder(x.signum, x.magnitude, x.length, 0, y.signum, y.magnitude, y.length, 0, false);
  };

  var compareToBigIntegerNumber = function (x, y) {
    return compareTo(x.signum, x.magnitude, x.length, 0, sign(y), undefined, sign(abs(y)), abs(y));
  };

  var compareToNumberBigInteger = function (x, y) {
    return compareTo(sign(x), undefined, sign(abs(x)), abs(x), y.signum, y.magnitude, y.length, 0);
  };

  var compareToNumberNumber = function (x, y) {
    return x < y ? -1 : (y < x ? +1 : 0);
  };

  var negateNumber = function (x) {
    return 0 - x;
  };

  var addBigIntegerNumber = function (x, y) {
    return add(x.signum, x.magnitude, x.length, 0, sign(y), undefined, sign(abs(y)), abs(y));
  };

  var addNumberBigInteger = function (x, y) {
    return add(sign(x), undefined, sign(abs(x)), abs(x), y.signum, y.magnitude, y.length, 0);
  };

  var addNumberNumber = function (x, y) {
    var value = x + y;
    if (value > -BASE && value < +BASE) {
      return value;
    }
    return add(sign(x), undefined, sign(abs(x)), abs(x), sign(y), undefined, sign(abs(y)), abs(y));
  };

  var subtractBigIntegerNumber = function (x, y) {
    return add(x.signum, x.magnitude, x.length, 0, 0 - sign(y), undefined, sign(abs(y)), abs(y));
  };

  var subtractNumberBigInteger = function (x, y) {
    return add(sign(x), undefined, sign(abs(x)), abs(x), 0 - y.signum, y.magnitude, y.length, 0);
  };

  var subtractNumberNumber = function (x, y) {
    var value = x - y;
    if (value > -BASE && value < +BASE) {
      return value;
    }
    return add(sign(x), undefined, sign(abs(x)), abs(x), 0 - sign(y), undefined, sign(abs(y)), abs(y));
  };

  var multiplyBigIntegerNumber = function (x, y) {
    return multiply(x.signum, x.magnitude, x.length, 0, sign(y), undefined, sign(abs(y)), abs(y));
  };

  var multiplyNumberBigInteger = function (x, y) {
    return multiply(sign(x), undefined, sign(abs(x)), abs(x), y.signum, y.magnitude, y.length, 0);
  };

  var multiplyNumberNumber = function (x, y) {
    var value = 0 + x * y;
    if (value > -BASE && value < +BASE) {
      return value;
    }
    return multiply(sign(x), undefined, sign(abs(x)), abs(x), sign(y), undefined, sign(abs(y)), abs(y));
  };

  var divideBigIntegerNumber = function (x, y) {
    return divideAndRemainder(x.signum, x.magnitude, x.length, 0, sign(y), undefined, sign(abs(y)), abs(y), true);
  };

  var divideNumberBigInteger = function (x, y) {
    return divideAndRemainder(sign(x), undefined, sign(abs(x)), abs(x), y.signum, y.magnitude, y.length, 0, true);
  };

  var divideNumberNumber = function (x, y) {
    if (0 + y === 0) {
      throw new RangeError();
    }
    return 0 + trunc(x / y);
  };

  var remainderBigIntegerNumber = function (x, y) {
    return divideAndRemainder(x.signum, x.magnitude, x.length, 0, sign(y), undefined, sign(abs(y)), abs(y), false);
  };

  var remainderNumberBigInteger = function (x, y) {
    return divideAndRemainder(sign(x), undefined, sign(abs(x)), abs(x), y.signum, y.magnitude, y.length, 0, false);
  };

  var remainderNumberNumber = function (x, y) {
    if (0 + y === 0) {
      throw new RangeError();
    }
    return 0 + x % y;
  };

  // see http://jsperf.com/symbol-vs-property/3

  var Symbol = function (s) {
    return s;
  };

  // public:
  BigInteger.parseInt = parseBigInteger;
  BigInteger.compareTo = Symbol("BigInteger.compareTo");
  BigInteger.negate = Symbol("BigInteger.negate");
  BigInteger.add = Symbol("BigInteger.add");
  BigInteger.subtract = Symbol("BigInteger.subtract");
  BigInteger.multiply = Symbol("BigInteger.multiply");
  BigInteger.divide = Symbol("BigInteger.divide");
  BigInteger.remainder = Symbol("BigInteger.remainder");

  // private:
  var COMPARE_TO_NUMBER = Symbol("COMPARE_TO_NUMBER");
  var COMPARE_TO_BIG_INTEGER = Symbol("COMPARE_TO_BIG_INTEGER");
  var ADD_NUMBER = Symbol("ADD_NUMBER");
  var ADD_BIG_INTEGER = Symbol("ADD_BIG_INTEGER");
  var SUBTRACT_NUMBER = Symbol("SUBTRACT_NUMBER");
  var SUBTRACT_BIG_INTEGER = Symbol("SUBTRACT_BIG_INTEGER");
  var MULTIPLY_NUMBER = Symbol("MULTIPLY_NUMBER");
  var MULTIPLY_BIG_INTEGER = Symbol("MULTIPLY_BIG_INTEGER");
  var DIVIDE_NUMBER = Symbol("DIVIDE_NUMBER");
  var DIVIDE_BIG_INTEGER = Symbol("DIVIDE_BIG_INTEGER");
  var REMAINDER_NUMBER = Symbol("REMAINDER_NUMBER");
  var REMAINDER_BIG_INTEGER = Symbol("REMAINDER_BIG_INTEGER");

  Number.prototype[BigInteger.compareTo] = function (y) {
    return y["COMPARE_TO_NUMBER"](this);
  };
  Number.prototype[BigInteger.negate] = function () {
    return negateNumber(this);
  };
  Number.prototype[BigInteger.add] = function (y) {
    return y["ADD_NUMBER"](this);
  };
  Number.prototype[BigInteger.subtract] = function (y) {
    return y["SUBTRACT_NUMBER"](this);
  };
  Number.prototype[BigInteger.multiply] = function (y) {
    return y["MULTIPLY_NUMBER"](this);
  };
  Number.prototype[BigInteger.divide] = function (y) {
    return y["DIVIDE_NUMBER"](this);
  };
  Number.prototype[BigInteger.remainder] = function (y) {
    return y["REMAINDER_NUMBER"](this);
  };

  Number.prototype[COMPARE_TO_BIG_INTEGER] = function (x) {
    return compareToBigIntegerNumber(x, this);
  };
  Number.prototype[ADD_BIG_INTEGER] = function (x) {
    return addBigIntegerNumber(x, this);
  };
  Number.prototype[SUBTRACT_BIG_INTEGER] = function (x) {
    return subtractBigIntegerNumber(x, this);
  };
  Number.prototype[MULTIPLY_BIG_INTEGER] = function (x) {
    return multiplyBigIntegerNumber(x, this);
  };
  Number.prototype[DIVIDE_BIG_INTEGER] = function (x) {
    return divideBigIntegerNumber(x, this);
  };
  Number.prototype[REMAINDER_BIG_INTEGER] = function (x) {
    return remainderBigIntegerNumber(x, this);
  };

  Number.prototype[COMPARE_TO_NUMBER] = function (x) {
    return compareToNumberNumber(x, this);
  };
  Number.prototype[ADD_NUMBER] = function (x) {
    return addNumberNumber(x, this);
  };
  Number.prototype[SUBTRACT_NUMBER] = function (x) {
    return subtractNumberNumber(x, this);
  };
  Number.prototype[MULTIPLY_NUMBER] = function (x) {
    return multiplyNumberNumber(x, this);
  };
  Number.prototype[DIVIDE_NUMBER] = function (x) {
    return divideNumberNumber(x, this);
  };
  Number.prototype[REMAINDER_NUMBER] = function (x) {
    return remainderNumberNumber(x, this);
  };

  function F() {
  }
  F.prototype = Number.prototype;

  BigInteger.prototype = new F();

  BigInteger.prototype.toString = function (radix) {
    if (radix === undefined) {
      radix = 10;
    }
    checkRadix(radix);
    return toString(this.signum, this.magnitude, this.length, radix);
  };

  BigInteger.prototype[BigInteger.compareTo] = function (y) {
    return y["COMPARE_TO_BIG_INTEGER"](this);
  };
  BigInteger.prototype[BigInteger.negate] = function () {
    return negateBigInteger(this);
  };
  BigInteger.prototype[BigInteger.add] = function (y) {
    return y["ADD_BIG_INTEGER"](this);
  };
  BigInteger.prototype[BigInteger.subtract] = function (y) {
    return y["SUBTRACT_BIG_INTEGER"](this);
  };
  BigInteger.prototype[BigInteger.multiply] = function (y) {
    return y["MULTIPLY_BIG_INTEGER"](this);
  };
  BigInteger.prototype[BigInteger.divide] = function (y) {
    return y["DIVIDE_BIG_INTEGER"](this);
  };
  BigInteger.prototype[BigInteger.remainder] = function (y) {
    return y["REMAINDER_BIG_INTEGER"](this);
  };

  BigInteger.prototype[COMPARE_TO_BIG_INTEGER] = function (x) {
    return compareToBigIntegerBigInteger(x, this);
  };
  BigInteger.prototype[ADD_BIG_INTEGER] = function (x) {
    return addBigIntegerBigInteger(x, this);
  };
  BigInteger.prototype[SUBTRACT_BIG_INTEGER] = function (x) {
    return subtractBigIntegerBigInteger(x, this);
  };
  BigInteger.prototype[MULTIPLY_BIG_INTEGER] = function (x) {
    return multiplyBigIntegerBigInteger(x, this);
  };
  BigInteger.prototype[DIVIDE_BIG_INTEGER] = function (x) {
    return divideBigIntegerBigInteger(x, this);
  };
  BigInteger.prototype[REMAINDER_BIG_INTEGER] = function (x) {
    return remainderBigIntegerBigInteger(x, this);
  };

  BigInteger.prototype[COMPARE_TO_NUMBER] = function (x) {
    return compareToNumberBigInteger(x, this);
  };
  BigInteger.prototype[ADD_NUMBER] = function (x) {
    return addNumberBigInteger(x, this);
  };
  BigInteger.prototype[SUBTRACT_NUMBER] = function (x) {
    return subtractNumberBigInteger(x, this);
  };
  BigInteger.prototype[MULTIPLY_NUMBER] = function (x) {
    return multiplyNumberBigInteger(x, this);
  };
  BigInteger.prototype[DIVIDE_NUMBER] = function (x) {
    return divideNumberBigInteger(x, this);
  };
  BigInteger.prototype[REMAINDER_NUMBER] = function (x) {
    return remainderNumberBigInteger(x, this);
  };

  exports.BigInteger = BigInteger;

}(this));
