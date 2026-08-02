import { readFile } from "node:fs/promises";

const index = JSON.parse(
  await readFile(new URL("../public/data/index.json", import.meta.url), "utf8"),
);
const records = JSON.parse(
  await readFile(new URL("../public/data/rates.json", import.meta.url), "utf8"),
);

if (
  index.schemaVersion !== 1 ||
  index.asOf !== "2026-08-02" ||
  index.years.join(",") !== "2023,2024,2025" ||
  index.employmentCount !== 3 ||
  index.groupCount !== 11 ||
  index.occupationCount !== 73 ||
  index.recordCount !== 73 ||
  index.pairCount !== 657 ||
  index.sourceValueCount !== 1314 ||
  index.availableSourceValueCount !== 1314 ||
  index.unavailableSourceValueCount !== 0 ||
  index.calculableRateCount !== 657 ||
  index.unavailablePairCount !== 0 ||
  index.zeroDenominatorCount !== 0 ||
  index.over100Count !== 0 ||
  index.maxRate !== 83.333333
)
  throw new Error("Unexpected data dimensions");
if (
  index.sources[0].sha256 !== "99e2cad815251763fdb05265e6a8b0be29d04db9615e997646db402591dca8c2" ||
  index.sources[1].sha256 !== "d1ed45ec4ab82f1ba64cf5b923e1dd74528ffd7b13df8d4d1665b5e1d93f4256"
)
  throw new Error("Unexpected source SHA-256");

const ids = new Set(index.occupations.map((item) => item.id));
const keys = new Set();
let pairs = 0;
let maximum = 0;
for (const record of records) {
  if (!ids.has(record.o) || keys.has(record.o)) throw new Error(`Invalid occupation: ${record.o}`);
  keys.add(record.o);
  if (Object.keys(record).sort().join(",") !== "a,f,o,t")
    throw new Error(`${record.o}: unexpected record shape`);
  for (const employment of ["a", "f", "t"]) {
    if (!Array.isArray(record[employment]) || record[employment].length !== 3)
      throw new Error(`${record.o}: invalid series`);
    for (const pair of record[employment]) {
      if (!Array.isArray(pair) || pair.length !== 2) throw new Error(`${record.o}: invalid pair`);
      for (const value of pair)
        if (!Number.isInteger(value) || value < 0)
          throw new Error(`${record.o}: invalid published value`);
      if (pair[0] === 0) throw new Error(`${record.o}: zero denominator`);
      maximum = Math.max(maximum, (pair[1] / pair[0]) * 100);
      pairs += 1;
    }
  }
  for (let year = 0; year < 3; year += 1)
    for (let side = 0; side < 2; side += 1)
      if (record.a[year][side] !== record.f[year][side] + record.t[year][side])
        throw new Error(`${record.o}: employment identity mismatch`);
}
if (keys.size !== 73 || pairs !== 657 || Math.abs(maximum - 83.33333333333333) > 1e-9)
  throw new Error("Published rate distribution changed");

const find = (id) => records.find((record) => record.o === id);
if (JSON.stringify(find("10").a.at(-1)) !== "[208705,5137]") throw new Error("IT values changed");
if (JSON.stringify(find("25").a.at(-1)) !== "[602900,169069]")
  throw new Error("Office values changed");
if (JSON.stringify(find("36").a.at(-1)) !== "[822436,59313]")
  throw new Error("Care values changed");

console.log(JSON.stringify({ calculableRates: pairs, occupations: keys.size, sourceValues: 1314 }));
