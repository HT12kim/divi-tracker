/**
 * 빌드 타임에 DART corpCode.xml ZIP을 다운로드하여
 * { stockCode: corpCode } JSON 매핑 파일을 생성합니다.
 *
 * 런타임에 3.5MB ZIP 다운로드를 제거하여 Netlify Free 10초 제한 내에서 동작하게 합니다.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { inflateRaw } from 'zlib';
import { promisify } from 'util';
import { dirname } from 'path';

const inflateRawP = promisify(inflateRaw);
const DART_API_KEY = process.env.DART_API_KEY || '';
const OUTPUT_PATH = 'netlify/functions/corp-codes.json';

// ── 순수 Node.js ZIP 파서 ──────────────────────────────────────────────────
const readFirstZipEntry = async (buf) => {
    let eocdPos = buf.length - 22;
    while (eocdPos >= 0 && buf.readUInt32LE(eocdPos) !== 0x06054b50) eocdPos--;
    if (eocdPos < 0) throw new Error('ZIP: EOCD signature not found');

    const cdOffset = buf.readUInt32LE(eocdPos + 16);
    if (buf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error('ZIP: CD signature not found');

    const compression = buf.readUInt16LE(cdOffset + 10);
    const compressedSize = buf.readUInt32LE(cdOffset + 20);
    const localHdrOffset = buf.readUInt32LE(cdOffset + 42);

    const lFnLen = buf.readUInt16LE(localHdrOffset + 26);
    const lExtraLen = buf.readUInt16LE(localHdrOffset + 28);
    const dataStart = localHdrOffset + 30 + lFnLen + lExtraLen;
    const compressedData = buf.subarray(dataStart, dataStart + compressedSize);

    if (compression === 0) return compressedData;
    if (compression === 8) return inflateRawP(compressedData);
    throw new Error(`ZIP: unsupported compression ${compression}`);
};

// ── 메인 ───────────────────────────────────────────────────────────────────
const main = async () => {
    if (!DART_API_KEY) {
        console.error('❌ DART_API_KEY 환경변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    console.log('⏳ DART corpCode.xml ZIP 다운로드 중...');
    const res = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${DART_API_KEY}`);
    if (!res.ok) {
        console.error(`❌ DART corpCode HTTP ${res.status}`);
        process.exit(1);
    }

    const zipBuf = Buffer.from(await res.arrayBuffer());
    console.log(`📦 ZIP 크기: ${(zipBuf.length / 1024 / 1024).toFixed(2)} MB`);

    const xmlBuf = await readFirstZipEntry(zipBuf);
    const xml = xmlBuf.toString('utf-8');

    // stockCode가 있는 항목만 (상장사만)
    const map = {};
    const entries = xml.match(/<list>[\s\S]*?<\/list>/g) || [];
    let total = 0;
    for (const entry of entries) {
        const sc = entry.match(/<stock_code>([^<]+)/)?.[1]?.trim();
        const cc = entry.match(/<corp_code>([^<]+)/)?.[1]?.trim();
        if (sc && sc.trim() && cc) {
            map[sc] = cc;
            total++;
        }
    }

    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, JSON.stringify(map));

    const fileSize = Buffer.byteLength(JSON.stringify(map));
    console.log(`✅ ${total}개 상장사 매핑 생성 → ${OUTPUT_PATH} (${(fileSize / 1024).toFixed(1)} KB)`);
};

main().catch((err) => {
    console.error('❌ 빌드 실패:', err.message);
    process.exit(1);
});
