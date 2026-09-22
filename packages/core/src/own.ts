/**
 * Write `key` as an OWN, enumerable data property, the way JSON.parse does.
 *
 * `obj[key] = value` is not that: with a caller-supplied key of "__proto__" it
 * calls the prototype setter, so the key vanishes from the copy's own keys (and
 * from every check and signature that walks them) while its value becomes the
 * copy's prototype. Every place the kernel copies caller-supplied keys uses this.
 */
export function setOwn<T>(obj: Record<string, T>, key: string, value: NoInfer<T>): void {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}
