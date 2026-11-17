import { describe, expect, test } from 'vitest';
import { csvRecords, parseCSV } from './csv';

describe('parseCSV', () => {
  test('splits cells and lines', () => {
    expect(parseCSV('a,b\n1,2\r\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });
  test('keeps commas and quotes inside a quoted cell', () => {
    expect(parseCSV('name\n"Rao, Ananya ""AR"""')).toEqual([['name'], ['Rao, Ananya "AR"']]);
  });
  test('removes empty lines and a byte order mark', () => {
    expect(parseCSV('﻿a\n\n , \n1\n')).toEqual([['a'], ['1']]);
  });
});

describe('csvRecords', () => {
  test('maps each row to the header names', () => {
    expect(csvRecords(' Name ,phone\nAsha , 99\nRavi')).toEqual([
      { name: 'Asha', phone: '99' },
      { name: 'Ravi', phone: '' },
    ]);
  });
  test('returns null without a data row', () => {
    expect(csvRecords('name,phone\n')).toBeNull();
    expect(csvRecords('')).toBeNull();
  });
});
