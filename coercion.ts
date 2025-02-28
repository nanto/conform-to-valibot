import {
  type BaseIssue,
  type GenericSchema,
  type GenericSchemaAsync,
  type PipeItem,
  type SchemaWithPipe,
  type SchemaWithPipeAsync,
  pipe,
  pipeAsync,
  transform as vTransform,
  unknown as valibotUnknown,
} from "valibot";

/**
 * Helpers for coercing string value
 * Modify the value only if it's a string, otherwise return the value as-is
 */
export function coerceString(
  value: unknown,
  transform?: (text: string) => unknown,
) {
  if (typeof value !== "string") {
    return value;
  }

  if (value === "") {
    return undefined;
  }

  if (typeof transform !== "function") {
    return value;
  }

  try {
    return transform(value);
  } catch {
    return undefined;
  }
}

/**
 * Reconstruct the provided schema with additional preprocessing steps
 * This coerce empty values to undefined and transform strings to the correct type
 * @param type The schema to be coerced
 * @param transform The transformation function
 * @returns The coerced schema
 */
function coerce<T extends GenericSchema | GenericSchemaAsync>(
  type: T,
  transform?: (text: string) => unknown,
) {
  // `expects` is required to generate error messages for `TupleSchema`, so it is passed to `UnkonwSchema` for coercion.
  const unknown = { ...valibotUnknown(), expects: type.expects };
  const transformFunction = (output: unknown) =>
    type.type === "blob" || type.type === "file"
      ? coerceFile(output)
      : coerceString(output, transform);

  if (type.async) {
    return pipeAsync(unknown, vTransform(transformFunction), type);
  }

  return pipe(unknown, vTransform(transformFunction), type);
}

/**
 * Helpers for coercing array value
 * Modify the value only if it's an array, otherwise return the value as-is
 */
function coerceArray<T extends GenericSchema | GenericSchemaAsync>(type: T) {
  // `expects` is required to generate error messages for `TupleSchema`, so it is passed to `UnkonwSchema` for coercion.
  const unknown = { ...valibotUnknown(), expects: type.expects };
  const transformFunction = (output: unknown): unknown => {
    if (Array.isArray(output)) {
      return output;
    }

    if (
      typeof output === "undefined" ||
      typeof coerceFile(coerceString(output)) === "undefined"
    ) {
      return [];
    }

    return [output];
  };

  if (type.async) {
    return pipeAsync(unknown, vTransform(transformFunction), type);
  }

  return pipe(unknown, vTransform(transformFunction), type);
}

/**
 * Helpers for coercing file
 * Modify the value only if it's a file, otherwise return the value as-is
 */
function coerceFile(file: unknown) {
  if (
    typeof File !== "undefined" &&
    file instanceof File &&
    file.name === "" &&
    file.size === 0
  ) {
    return undefined;
  }

  return file;
}

/**
 * If a pipe is assigned by referencing the original schema, convert it to assign the original pipe to the coerced schema.
 * @param originalSchema The original schema
 * @param coercionSchema The schema to be coerced
 * @returns The coerced schema with the original pipe
 */
function generateReturnSchema<
  T extends GenericSchema | GenericSchemaAsync,
  E extends
    | GenericSchema
    | GenericSchemaAsync
    | SchemaWithPipe<
        [GenericSchema, ...PipeItem<unknown, unknown, BaseIssue<unknown>>[]]
      >
    | SchemaWithPipeAsync<
        [
          GenericSchema | GenericSchemaAsync,
          ...PipeItem<unknown, unknown, BaseIssue<unknown>>[],
        ]
      >,
>(
  originalSchema:
    | T
    | (T extends GenericSchema
        ? SchemaWithPipe<
            [T, ...PipeItem<unknown, unknown, BaseIssue<unknown>>[]]
          >
        : SchemaWithPipeAsync<
            [T, ...PipeItem<unknown, unknown, BaseIssue<unknown>>[]]
          >),
  coercionSchema: E,
) {
  if ("pipe" in originalSchema) {
    if (originalSchema.async && coercionSchema.async) {
      return pipeAsync(
        coercionSchema,
        // @ts-expect-error
        ...originalSchema.pipe.slice(1),
      );
    }
    return pipe(
      coercionSchema,
      // @ts-expect-error
      ...originalSchema.pipe.slice(1),
    );
  }

  return coercionSchema;
}

/**
 * Reconstruct the provided schema with additional preprocessing steps
 * This coerce empty values to undefined and transform strings to the correct type
 */
export function enableTypeCoercion<
  T extends GenericSchema | GenericSchemaAsync,
>(
  type:
    | T
    | (T extends GenericSchema
        ? SchemaWithPipe<
            [T, ...PipeItem<unknown, unknown, BaseIssue<unknown>>[]]
          >
        : SchemaWithPipeAsync<
            [T, ...PipeItem<unknown, unknown, BaseIssue<unknown>>[]]
          >),
): {
  coerced: boolean;
  schema:
    | ReturnType<typeof coerce>
    | ReturnType<typeof generateReturnSchema>
    | (T extends GenericSchema
        ? SchemaWithPipe<
            [T, ...PipeItem<unknown, unknown, BaseIssue<unknown>>[]]
          >
        : SchemaWithPipeAsync<
            [T, ...PipeItem<unknown, unknown, BaseIssue<unknown>>[]]
          >);
} {
  const originalSchema = "pipe" in type ? type.pipe[0] : type;

  switch (type.type) {
    case "string":
    case "literal":
    case "enum":
    case "undefined": {
      return { coerced: true, schema: coerce(type) };
    }
    case "number": {
      return { coerced: true, schema: coerce(type, Number) };
    }
    case "boolean": {
      return {
        coerced: true,
        schema: coerce(type, (text) => (text === "on" ? true : text)),
      };
    }
    case "date": {
      return {
        coerced: true,
        schema: coerce(type, (timestamp) => {
          const date = new Date(timestamp);
          if (Number.isNaN(date.getTime())) {
            return timestamp;
          }

          return date;
        }),
      };
    }
    case "bigint": {
      return { coerced: true, schema: coerce(type, BigInt) };
    }
    case "file":
    case "blob": {
      return { coerced: true, schema: coerce(type) };
    }
    case "array": {
      const arraySchema = {
        ...originalSchema,
        // @ts-expect-error
        item: enableTypeCoercion(originalSchema.item).schema,
      };
      return {
        coerced: false,
        schema: generateReturnSchema(type, coerceArray(arraySchema)),
      };
    }
    case "optional":
    case "nullish":
    case "nullable":
    case "non_optional":
    case "non_nullish":
    case "non_nullable": {
      // @ts-expect-error
      const { coerced, schema: wrapSchema } = enableTypeCoercion(type.wrapped);

      if (coerced) {
        // `expects` is required to generate error messages for `TupleSchema`, so it is passed to `UnkonwSchema` for coercion.
        const unknown = { ...valibotUnknown(), expects: type.expects };
        if (type.async) {
          return {
            coerced,
            schema: pipeAsync(unknown, wrapSchema.pipe[1], type),
          };
        }
        return {
          coerced,
          schema: pipe(unknown, wrapSchema.pipe[1], type),
        };
      }

      const wrappedSchema = {
        ...originalSchema,
        // @ts-expect-error
        wrapped: enableTypeCoercion(originalSchema.wrapped).schema,
      };

      return {
        coerced: false,
        schema: generateReturnSchema(type, wrappedSchema),
      };
    }
    case "union":
    case "intersect": {
      const unionSchema = {
        ...originalSchema,
        // @ts-expect-error
        options: originalSchema.options.map(
          // @ts-expect-error
          (option) => enableTypeCoercion(option as GenericSchema).schema,
        ),
      };
      return {
        coerced: false,
        schema: generateReturnSchema(type, unionSchema),
      };
    }
    case "variant": {
      const variantSchema = {
        ...originalSchema,
        // @ts-expect-error
        options: originalSchema.options.map(
          // @ts-expect-error
          (option) => enableTypeCoercion(option as GenericSchema).schema,
        ),
      };
      return {
        coerced: false,
        schema: generateReturnSchema(type, variantSchema),
      };
    }
    case "tuple": {
      const tupleSchema = {
        ...originalSchema,
        // @ts-expect-error
        items: originalSchema.items.map(
          // @ts-expect-error
          (option) => enableTypeCoercion(option).schema,
        ),
      };
      return {
        coerced: false,
        schema: generateReturnSchema(type, tupleSchema),
      };
    }
    case "tuple_with_rest": {
      const tupleWithRestSchema = {
        ...originalSchema,
        // @ts-expect-error
        items: originalSchema.items.map(
          // @ts-expect-error
          (option) => enableTypeCoercion(option).schema,
        ),
        // @ts-expect-error
        rest: enableTypeCoercion(originalSchema.rest).schema,
      };
      return {
        coerced: false,
        schema: generateReturnSchema(type, tupleWithRestSchema),
      };
    }
    case "loose_object":
    case "strict_object":
    case "object": {
      const objectSchema = {
        ...originalSchema,
        entries: Object.fromEntries(
          // @ts-expect-error
          Object.entries(originalSchema.entries).map(([key, def]) => [
            key,
            enableTypeCoercion(def as GenericSchema).schema,
          ]),
        ),
      };

      return {
        coerced: false,
        schema: generateReturnSchema(type, objectSchema),
      };
    }
    case "object_with_rest": {
      const objectWithRestSchema = {
        ...originalSchema,
        entries: Object.fromEntries(
          // @ts-expect-error
          Object.entries(originalSchema.entries).map(([key, def]) => [
            key,
            enableTypeCoercion(def as GenericSchema).schema,
          ]),
        ),
        // @ts-expect-error
        rest: enableTypeCoercion(originalSchema.rest).schema,
      };

      return {
        coerced: false,
        schema: generateReturnSchema(type, objectWithRestSchema),
      };
    }
  }

  return { coerced: true, schema: coerce(type) };
}
