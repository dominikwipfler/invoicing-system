const { forAll } = require('claire');
const { Octet, ShortStr, LongStr, UShort, ULong, ULongLong, Short, Long, LongLong, Bit, Double, Float, Decimal, Timestamp, FieldTable, FieldArray } = require('./lib/data');

const domainProps = [
  [Octet, (n) => n >= 0 && n < 256],
  [ShortStr, (s) => typeof s === 'string' && s.length < 256],
  [LongStr, (s) => Buffer.isBuffer(s)],
  [UShort, (n) => n >= 0 && n <= 0xffff],
  [ULong, (n) => n >= 0 && n <= 0xffffffff],
  [ULongLong, (n) => n >= 0 && n <= 0xffffffffffffffff],
  [Short, (n) => n >= -0x8000 && n <= 0x8000],
  [Long, (n) => n >= -0x80000000 && n < 0x80000000],
  [LongLong, (n) => n >= Number.MIN_SAFE_INTEGER && n <= Number.MAX_SAFE_INTEGER],
  [Bit, (b) => typeof b === 'boolean'],
  [Double, (f) => !Number.isNaN(f) && Number.isFinite(f)],
  [Float, (f) => !Number.isNaN(f) && Number.isFinite(f) && Math.log(Math.abs(f)) * Math.LOG10E < 309],
  [Decimal, (d) => d['!'] === 'decimal' && d.value['places'] <= 255 && d.value['digits'] <= 0xffffffff],
  [Timestamp, (t) => t['!'] === 'timestamp'],
  [FieldTable, (t) => typeof t === 'object'],
  [FieldArray, (a) => Array.isArray(a)],
];

if (global.describe) {
  describe('Domains', () => {
    domainProps.forEach((p) => {
      console.log(p[0].toString())
      it(`${p[0]} domain`, forAll(p[0]).satisfy((v) => {
        console.log({ v });
        return p[1](v)
      }).asTest({ times: 1 }));
    });
  });
}
