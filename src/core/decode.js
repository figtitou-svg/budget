export function decodeBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = new TextDecoder('utf-8').decode(u8);
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(u8);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}
