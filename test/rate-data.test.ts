import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Pair = [number | null, number | null];
type RecordRow = { o: string; a: Pair[]; f: Pair[]; t: Pair[] };
const root = process.cwd();
const index = JSON.parse(readFileSync(resolve(root, "public/data/index.json"), "utf8"));
const records = JSON.parse(
  readFileSync(resolve(root, "public/data/rates.json"), "utf8"),
) as RecordRow[];
const find = (id: string) => records.find((record) => record.o === id)!;

describe("official nationwide occupation fulfillment-rate inputs", () => {
  it("retains verified sources and nationwide dimensions", () => {
    expect(index).toMatchObject({
      asOf: "2026-08-02",
      edition: "2023〜2025年度（現行表・全国計）",
      years: [2023, 2024, 2025],
      employmentCount: 3,
      groupCount: 11,
      occupationCount: 73,
      recordCount: 73,
      pairCount: 657,
      sourceValueCount: 1314,
      availableSourceValueCount: 1314,
      unavailableSourceValueCount: 0,
      calculableRateCount: 657,
      unavailablePairCount: 0,
      zeroDenominatorCount: 0,
      over100Count: 0,
      maxRate: 83.333333,
      employmentIdentityChecked: { openings: 10_378, placements: 10_512 },
      nationalSumChecked: { openings: 645, placements: 657 },
    });
    expect(index.sources).toEqual([
      {
        kind: "openings",
        url: "https://www.mhlw.go.jp/toukei/list/xls/114-1d-06.xlsx",
        bytes: 991_012,
        sha256: "99e2cad815251763fdb05265e6a8b0be29d04db9615e997646db402591dca8c2",
      },
      {
        kind: "placements",
        url: "https://www.mhlw.go.jp/toukei/list/xls/114-1d-08.xlsx",
        bytes: 931_773,
        sha256: "d1ed45ec4ab82f1ba64cf5b923e1dd74528ffd7b13df8d4d1665b5e1d93f4256",
      },
    ]);
  });

  it("contains one unique row for every published occupation", () => {
    expect(records).toHaveLength(73);
    expect(new Set(records.map((record) => record.o)).size).toBe(73);
    expect(index.groups).toHaveLength(11);
    expect(index.occupations).toHaveLength(73);
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual(["a", "f", "o", "t"]);
      for (const employment of ["a", "f", "t"] as const) {
        expect(record[employment]).toHaveLength(3);
        for (const pair of record[employment]) {
          expect(pair).toHaveLength(2);
          for (const value of pair) {
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("retains representative nationwide counts", () => {
    expect(find("10").a).toEqual([
      [208_361, 6018],
      [214_801, 5423],
      [208_705, 5137],
    ]);
    expect(find("25").a.at(-1)).toEqual([602_900, 169_069]);
    expect(find("36").a.at(-1)).toEqual([822_436, 59_313]);
    expect(find("02").t.at(-1)).toEqual([6, 5]);
  });

  it("preserves employment identities and the uncapped rate distribution", () => {
    let calculable = 0;
    let over100 = 0;
    let maximum = 0;
    for (const record of records) {
      for (let year = 0; year < 3; year += 1) {
        for (let side = 0; side < 2; side += 1)
          expect(record.a[year][side]).toBe(record.f[year][side]! + record.t[year][side]!);
      }
      for (const employment of ["a", "f", "t"] as const)
        for (const [openings, placements] of record[employment]) {
          expect(openings).toBeGreaterThan(0);
          const rate = (placements! / openings!) * 100;
          calculable += 1;
          over100 += Number(rate > 100);
          maximum = Math.max(maximum, rate);
        }
    }
    expect(calculable).toBe(657);
    expect(over100).toBe(0);
    expect(maximum).toBeCloseTo(83.333333, 6);
  });

  it("stays within the static delivery budget", () => {
    expect(statSync(resolve(root, "public/data/rates.json")).size).toBeLessThan(15_000);
  });
});
