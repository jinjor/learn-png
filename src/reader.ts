export class Reader {
  private view: DataView;
  private offset: number;
  private littleEndian: boolean;
  constructor(buffer: ArrayBuffer, littleEndian = false) {
    this.view = new DataView(buffer);
    this.offset = 0;
    this.littleEndian = littleEndian;
  }
  getOffset(): number {
    return this.offset;
  }
  getUint8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }
  getUint16(): number {
    const value = this.view.getUint16(this.offset, this.littleEndian);
    this.offset += 2;
    return value;
  }
  getUint32(): number {
    const value = this.view.getUint32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }
  getArrayBuffer(length: number): ArrayBuffer {
    const offset = this.view.byteOffset + this.offset;
    const buf = this.view.buffer.slice(offset, offset + length);
    this.offset += length;
    return buf;
  }
  getString(length: number): string {
    return new TextDecoder().decode(this.getArrayBuffer(length));
  }
  getStringUntilNull(limit: number): string | null {
    const chars: number[] = [];
    for (let i = 0; i < limit; i++) {
      const c = this.getUint8();
      if (c === 0) {
        return String.fromCharCode(...chars);
      }
      chars.push(c);
    }
    return null;
  }
  // slice(length: number, littleEndian?: boolean): Reader {
  //   return new Reader(
  //     this.getArrayBuffer(length),
  //     littleEndian ?? this.littleEndian
  //   );
  // }
}
