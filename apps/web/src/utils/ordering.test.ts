import { describe, expect, it } from "vitest";
import { compareRoleThenPerson } from "./ordering";

describe("compareRoleThenPerson",()=>{
  it("ordena primero por rol y luego por persona",()=>{
    const rows=[
      {role:"SPONSOR",person:"Zulema"},
      {role:"ATF",person:"Brenda"},
      {role:"ATF",person:"Álvaro"},
    ];
    expect(rows.sort(compareRoleThenPerson(x=>x.role,x=>x.person))).toEqual([
      {role:"ATF",person:"Álvaro"},
      {role:"ATF",person:"Brenda"},
      {role:"SPONSOR",person:"Zulema"},
    ]);
  });
});
