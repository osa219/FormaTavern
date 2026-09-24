import { crc32, deflateSync } from 'node:zlib';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Creates a minimal valid 1x1 transparent RGBA PNG.
 */
export function createMinimalPng(): Uint8Array {
  const sig = Buffer.from(PNG_SIGNATURE);

  // IHDR: 1x1, 8-bit RGBA, def/filter/interlace = 0
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0); // width
  ihdrData.writeUInt32BE(1, 4); // height
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdrLen = Buffer.alloc(4);
  ihdrLen.writeUInt32BE(13, 0);
  const ihdrType = Buffer.from('IHDR');
  const ihdrCrc = Buffer.alloc(4);
  ihdrCrc.writeUInt32BE(crc32(Buffer.concat([ihdrType, ihdrData])), 0);
  const ihdr = Buffer.concat([ihdrLen, ihdrType, ihdrData, ihdrCrc]);

  // IDAT: filter 0 + 4 RGBA bytes
  const rawIdat = Buffer.from([0, 0, 0, 0, 0]);
  const compIdat = deflateSync(rawIdat);
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(compIdat.length, 0);
  const idatType = Buffer.from('IDAT');
  const idatCrc = Buffer.alloc(4);
  idatCrc.writeUInt32BE(crc32(Buffer.concat([idatType, compIdat])), 0);
  const idat = Buffer.concat([idatLen, idatType, compIdat, idatCrc]);

  // IEND
  const iendLen = Buffer.alloc(4);
  const iendType = Buffer.from('IEND');
  const iendCrc = Buffer.alloc(4);
  iendCrc.writeUInt32BE(crc32(iendType), 0);
  const iend = Buffer.concat([iendLen, iendType, iendCrc]);

  return new Uint8Array(Buffer.concat([sig, ihdr, idat, iend]));
}

/**
 * Extracts text chunks (tEXt and uncompressed iTXt) from PNG bytes.
 */
export function extractPngTextChunks(bytes: Uint8Array): Map<string, string> {
  const map = new Map<string, string>();
  if (!isPng(bytes)) return map;

  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  let offset = 8;

  while (offset + 12 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const dataOffset = offset + 8;
    const nextChunk = dataOffset + len + 4;

    if (nextChunk > buf.length) break;

    if (type === 'tEXt') {
      const chunkData = buf.subarray(dataOffset, dataOffset + len);
      const nullIdx = chunkData.indexOf(0);
      if (nullIdx !== -1) {
        const keyword = chunkData.subarray(0, nullIdx).toString('latin1');
        const text = chunkData.subarray(nullIdx + 1).toString('utf8');
        map.set(keyword, text);
      }
    } else if (type === 'iTXt') {
      const chunkData = buf.subarray(dataOffset, dataOffset + len);
      const nullIdx = chunkData.indexOf(0);
      if (nullIdx !== -1) {
        const keyword = chunkData.subarray(0, nullIdx).toString('utf8');
        // iTXt format: keyword\0 compFlag compMethod langTag\0 transKeyword\0 text
        const compFlag = chunkData[nullIdx + 1];
        if (compFlag === 0) {
          // Uncompressed
          let textOffset = nullIdx + 3;
          // Skip langTag
          const langNull = chunkData.indexOf(0, textOffset);
          if (langNull !== -1) {
            textOffset = langNull + 1;
            // Skip transKeyword
            const transNull = chunkData.indexOf(0, textOffset);
            if (transNull !== -1) {
              textOffset = transNull + 1;
              const text = chunkData.subarray(textOffset).toString('utf8');
              map.set(keyword, text);
            }
          }
        }
      }
    }

    if (type === 'IEND') break;
    offset = nextChunk;
  }

  return map;
}

/**
 * Embeds a tEXt chunk into PNG bytes before the IEND chunk.
 */
export function embedPngTextChunk(bytes: Uint8Array, keyword: string, text: string): Uint8Array {
  if (!isPng(bytes)) {
    throw new Error('Provided buffer is not a valid PNG');
  }

  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const kwBuf = Buffer.from(keyword, 'latin1');
  const nullByte = Buffer.from([0]);
  const textBuf = Buffer.from(text, 'utf8');
  const data = Buffer.concat([kwBuf, nullByte, textBuf]);

  const type = Buffer.from('tEXt');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crc = crc32(Buffer.concat([type, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  const chunk = Buffer.concat([lenBuf, type, data, crcBuf]);

  // Find IEND offset
  let offset = 8;
  let iendOffset = -1;

  while (offset + 12 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const typeStr = buf.subarray(offset + 4, offset + 8).toString('ascii');
    if (typeStr === 'IEND') {
      iendOffset = offset;
      break;
    }
    offset += 8 + len + 4;
  }

  if (iendOffset === -1) {
    iendOffset = buf.length - 12; // Fallback to last 12 bytes
  }

  return new Uint8Array(
    Buffer.concat([buf.subarray(0, iendOffset), chunk, buf.subarray(iendOffset)])
  );
}
