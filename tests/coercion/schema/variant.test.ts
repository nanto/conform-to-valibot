import { describe, expect, test } from "vitest";
import { parseWithValibot } from "../../../parse";
import { object, variant, literal, number, string } from "valibot";
import { createFormData } from "../../helpers/FormData";

describe("variant", () => {
  test("should pass only variant values", () => {
    const schema1 = variant("type", [
      object({ type: literal("a"), a: string() }),
      object({ type: literal("b"), b: number() }),
    ]);
    const input1 = createFormData("type", "a");
    input1.append("a", "hello");
    const output1 = parseWithValibot(input1, { schema: schema1 });
    expect(output1).toMatchObject({
      status: "success",
      value: { type: "a", a: "hello" },
    });
    const input2 = createFormData("type", "b");
    input2.append("b", "123");
    const output2 = parseWithValibot(input2, { schema: schema1 });
    expect(output2).toMatchObject({
      status: "success",
      value: { type: "b", b: 123 },
    });

    const schema2 = variant("type", [
      schema1,
      object({ type: literal("c"), foo: literal("foo") }),
      object({ type: literal("c"), bar: literal("bar") }),
    ]);
    const input3 = createFormData("type", "b");
    input3.append("b", "123");
    const output3 = parseWithValibot(input3, { schema: schema2 });
    expect(output3).toMatchObject({
      status: "success",
      value: { type: "b", b: 123 },
    });
    const input4 = createFormData("type", "c");
    input4.append("foo", "foo");
    const output4 = parseWithValibot(input4, { schema: schema2 });
    expect(output4).toMatchObject({
      status: "success",
      value: { type: "c", foo: "foo" },
    });
    const input5 = createFormData("type", "c");
    input5.append("bar", "bar");
    const output5 = parseWithValibot(input5, { schema: schema2 });
    expect(output5).toMatchObject({
      status: "success",
      value: { type: "c", bar: "bar" },
    });

    const errorInput1 = createFormData("type", "x");
    expect(parseWithValibot(errorInput1, { schema: schema2 })).toMatchObject({
      error: { type: ['Invalid type: Expected "a" | "b" but received "x"'] },
    });
    const errorInput2 = createFormData("type2", "a");
    expect(parseWithValibot(errorInput2, { schema: schema2 })).toMatchObject({
      error: {
        type: ['Invalid type: Expected "a" | "b" | "c" but received undefined'],
      },
    });
  });
});
