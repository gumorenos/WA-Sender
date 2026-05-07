export type MessagePreviewVariableMap = Record<string, string>;

export type MessagePreviewInlineSegment =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "strike"; value: string }
  | { type: "mono"; value: string }
  | { type: "variable"; name: string; value: string };

export type MessagePreviewLine = {
  index: number;
  segments: MessagePreviewInlineSegment[];
};

export type MessagePreviewDocument = {
  lines: MessagePreviewLine[];
};

export const DEFAULT_MESSAGE_PREVIEW_TEXT =
  "*Hola, {nombre}*\n" +
  "\n" +
  "Tu codigo de {empresa} es _WA-2048_.\n" +
  "Usa ~este enlace~ si necesitas ayuda.\n" +
  "Comparte ```{codigo}``` con soporte.\n" +
  "Escribenos si tienes dudas. \u{1F60A}";

export const DEFAULT_MESSAGE_PREVIEW_VARIABLES: MessagePreviewVariableMap = {
  nombre: "Andrea",
  empresa: "WA Sender",
  codigo: "WX-2048",
};

const VARIABLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const FORMATTING_MARKERS = new Map([
  ["*", "bold"],
  ["_", "italic"],
  ["~", "strike"],
] as const);

type FormattingKind = "bold" | "italic" | "strike";

function normalizeInput(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/\\n/g, "\n");
}

function isValidVariableName(value: string) {
  return VARIABLE_NAME_PATTERN.test(value);
}

function findClosingMarker(value: string, marker: string, fromIndex: number) {
  for (let index = fromIndex; index < value.length; index += 1) {
    if (value[index] === marker) {
      return index;
    }
  }

  return -1;
}

function mapMarkerToType(marker: string): FormattingKind {
  const type = FORMATTING_MARKERS.get(marker as "*" | "_" | "~");

  if (!type) {
    throw new Error(`Unsupported marker: ${marker}`);
  }

  return type;
}

function createTextSegment(buffer: string): MessagePreviewInlineSegment | null {
  if (!buffer) {
    return null;
  }

  return { type: "text", value: buffer };
}

function parseInlineSegments(
  line: string,
  variables: MessagePreviewVariableMap,
): MessagePreviewInlineSegment[] {
  const segments: MessagePreviewInlineSegment[] = [];
  let buffer = "";
  let index = 0;

  const flushBuffer = () => {
    const segment = createTextSegment(buffer);

    if (segment) {
      segments.push(segment);
    }

    buffer = "";
  };

  while (index < line.length) {
    if (line.startsWith("```", index)) {
      const endIndex = line.indexOf("```", index + 3);

      if (endIndex !== -1) {
        flushBuffer();
        segments.push({
          type: "mono",
          value: line.slice(index + 3, endIndex),
        });
        index = endIndex + 3;
        continue;
      }
    }

    const marker = line[index];

    if (FORMATTING_MARKERS.has(marker as "*" | "_" | "~")) {
      const endIndex = findClosingMarker(line, marker, index + 1);

      if (endIndex !== -1) {
        flushBuffer();
        segments.push({
          type: mapMarkerToType(marker),
          value: line.slice(index + 1, endIndex),
        });
        index = endIndex + 1;
        continue;
      }
    }

    if (marker === "{") {
      const closeIndex = line.indexOf("}", index + 1);

      if (closeIndex !== -1) {
        const variableName = line.slice(index + 1, closeIndex).trim();

        if (variableName && isValidVariableName(variableName)) {
          flushBuffer();
          segments.push({
            type: "variable",
            name: variableName,
            value: variables[variableName] ?? `{${variableName}}`,
          });
          index = closeIndex + 1;
          continue;
        }
      }
    }

    buffer += marker;
    index += 1;
  }

  flushBuffer();

  return segments;
}

export function parseMessagePreview(
  input: string,
  variables: MessagePreviewVariableMap = DEFAULT_MESSAGE_PREVIEW_VARIABLES,
): MessagePreviewDocument {
  const normalizedInput = normalizeInput(input);
  const lines = normalizedInput.split("\n");

  return {
    lines: lines.map((line, index) => ({
      index,
      segments: parseInlineSegments(line, variables),
    })),
  };
}

export function messagePreviewToPlainText(input: string) {
  return normalizeInput(input);
}
