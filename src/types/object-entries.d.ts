export {};

declare global {
  interface ObjectConstructor {
    /**
     * Chart/AI payloads are runtime objects whose properties are normalized
     * dynamically. This overload keeps Object.entries(object) usable in the
     * mobile visual extraction boundary without unsafe property-access errors.
     */
    entries(o: object): [string, Record<string, any>][];
  }
}
