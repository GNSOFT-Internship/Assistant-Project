// PDF 다운로드 기록 저장소.
//
// 서버는 완성된 PDF를 한 번에 내려줄 뿐 별도로 보관하지 않으므로, "예전에 받은 보고서를
// 다시 받고 싶다"는 요청은 결국 재생성(=다시 몇 초~몇십 초 기다림)으로 이어진다. 그래서
// 실제로 다운로드에 성공한 PDF 파일(Blob)을 브라우저에 그대로 저장해 두고, 기록 탭에서는
// 그 Blob을 즉시 다시 내려주는 방식을 쓴다.
//
// localStorage는 문자열만 저장할 수 있어 바이너리를 담으려면 base64로 부풀려야 하고
// 용량 제한도 작다(보통 5~10MB). PDF 같은 바이너리 Blob을 그대로, 넉넉한 용량으로
// 저장할 수 있는 브라우저 표준 저장소가 IndexedDB라 이를 사용한다.

const DB_NAME = 'assetReportPdfHistory';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('이 브라우저는 다운로드 기록 저장(IndexedDB)을 지원하지 않습니다.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('generatedAt', 'generatedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runTx(mode, work) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      work(store, (value) => {
        result = value;
      });
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// 생성 직후 다운로드에 성공한 PDF를 기록으로 남긴다. blob은 이미 만들어진 PDF 파일 그대로.
export function addEntry({ year, month, filename, blob }) {
  const entry = {
    id: `${year}-${String(month).padStart(2, '0')}-${Date.now()}`,
    year,
    month,
    filename,
    blob,
    size: blob.size,
    generatedAt: new Date().toISOString(),
  };
  return runTx('readwrite', (store, setResult) => {
    store.put(entry);
    setResult(entry);
  });
}

// 최신 다운로드가 위로 오도록 정렬해서 전체 기록을 반환한다.
export async function listEntries() {
  const entries = await runTx('readonly', (store, setResult) => {
    const request = store.getAll();
    request.onsuccess = () => setResult(request.result || []);
  });
  return (entries || []).sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
}

export function deleteEntry(id) {
  return runTx('readwrite', (store) => {
    store.delete(id);
  });
}
