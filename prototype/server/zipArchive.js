import { deflateRawSync } from "node:zlib";

// 最小 ZIP 打包器（无外部依赖，Node 内置 zlib 实现，离线可用）。
// 生成 ZIP 需要的三个结构：本地文件头 + 数据、中央目录、中央目录结束记录。

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY = 0x02014b50;
const END_OF_CENTRAL_DIR = 0x06054b50;
const VERSION_NEEDED = 20; // 2.0：支持 deflate
const UTF8_FLAG = 0x0800;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeFileName(name) {
  // ZIP 规范：文件名用 UTF-8 编码并置 UTF-8 标志位，中文名才能正确解压
  return Buffer.from(name, "utf8");
}

/**
 * 打包多个文件为一个 ZIP Buffer。
 * @param {Array<{name: string, content: string|Buffer}>} files
 * @returns {Buffer}
 */
export function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuffer = encodeFileName(file.name);
    const data = Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content), "utf8");
    const compressed = data.length > 0 ? deflateRawSync(data) : data;
    const crc = crc32(data);

    // 本地文件头
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER, 0);
    localHeader.writeUInt16LE(VERSION_NEEDED, 4);
    localHeader.writeUInt16LE(UTF8_FLAG, 6);
    localHeader.writeUInt16LE(8, 8); // deflate
    localHeader.writeUInt16LE(0, 10); // mtime
    localHeader.writeUInt16LE(0, 12); // mdate
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length

    localParts.push(localHeader, nameBuffer, compressed);
    const localSize = 30 + nameBuffer.length + compressed.length;

    // 中央目录记录
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_DIRECTORY, 0);
    central.writeUInt16LE(VERSION_NEEDED, 4); // version made by
    central.writeUInt16LE(VERSION_NEEDED, 6); // version needed
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(8, 10); // deflate
    central.writeUInt16LE(0, 12); // mtime
    central.writeUInt16LE(0, 14); // mdate
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(central, nameBuffer);
    offset += localSize;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(END_OF_CENTRAL_DIR, 0);
  endRecord.writeUInt16LE(0, 4); // disk
  endRecord.writeUInt16LE(0, 6); // central dir disk
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}
