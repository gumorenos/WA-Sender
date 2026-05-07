# Vista previa de mensaje

## Decision tecnica

La utilidad `/utilities/message-preview` usa un parser puro en `lib/message-preview.ts` y renderiza el resultado con nodos React directos.

No se usa `dangerouslySetInnerHTML`.

## Reglas de formato soportadas

- `\n` para saltos de linea.
- `*texto*` para negrita.
- `_texto_` para cursiva.
- `~texto~` para tachado.
- ```texto``` para monoespaciado.
- Variables `{nombre}`, `{empresa}`, `{codigo}` con valores de ejemplo en el preview.
- Emojis como texto normal.

## Comportamiento

- El editor actualiza la preview en vivo.
- Los marcadores sin cierre se muestran como texto literal.
- La vista previa es solo de render; no ejecuta HTML incrustado.

## Uso previsto

Esta utilidad sirve para validar el copy antes de campanas y agentes IA.
