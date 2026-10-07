// jsdom ships no type definitions. Rather than add @types/jsdom for the one
// constructor the stress test uses, declare just that.
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string)
    readonly window: Window & typeof globalThis
  }
}
