// The hooks environment has this method (the API's own examples call it);
// the es2023 library the plugin is typed against does not declare it yet.
interface Uint8Array {
  toBase64(): string
}
