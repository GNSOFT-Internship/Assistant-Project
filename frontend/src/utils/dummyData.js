// 프로토타입용 더미 데이터
// 실제 서비스 연동 시 이 파일은 사용하지 않고, 백엔드/AI 서버 API 응답으로 대체됩니다.

export const mockAssets = [
  {
    id: 1,
    assetName: '노트북 A',
    assetCode: 'IT-2021-001',
    category: 'IT장비',
    location: 'A동 3층',
    responsiblePerson: '김철수',
    purchaseDate: '2021-03-15',
    purchasePrice: 1500000,
    usefulLife: 5,
    status: 'REPLACEMENT_NEEDED',
  },
  {
    id: 2,
    assetName: '프린터 B',
    assetCode: 'IT-2019-014',
    category: '사무기기',
    location: 'A동 2층',
    responsiblePerson: '이영희',
    purchaseDate: '2019-06-01',
    purchasePrice: 800000,
    usefulLife: 7,
    status: 'ACTIVE',
  },
  {
    id: 3,
    assetName: '서버 C',
    assetCode: 'IT-2018-002',
    category: '서버',
    location: '전산실',
    responsiblePerson: '박민수',
    purchaseDate: '2018-01-10',
    purchasePrice: 12000000,
    usefulLife: 8,
    status: 'REPLACEMENT_NEEDED',
  },
  {
    id: 4,
    assetName: '업무용 차량 D',
    assetCode: 'VH-2022-003',
    category: '차량',
    location: '주차장',
    responsiblePerson: '최지훈',
    purchaseDate: '2022-05-20',
    purchasePrice: 25000000,
    usefulLife: 10,
    status: 'ACTIVE',
  },
];

export const mockSearchResults = {
  explanation: '조건에 맞는 자산 목록입니다.',
  assets: mockAssets,
};

export const mockQAResponses = {
  questions: {
    '총 자산': '현재 등록된 총 자산 수는 4대입니다.',
    '노트북': '노트북 관련 자산은 1대이며, 사용 기간이 5년을 초과하여 교체가 권장됩니다.',
    '교체': '교체가 필요한 자산은 노트북 A, 서버 C로 총 2건입니다.',
    '5 년 이상': '5년 이상 사용한 자산은 서버 C(구매 2018년, 사용 7년)입니다. 교체를 권장합니다.',
    '가장 오래된 서버': '가장 오래된 서버는 서버 C이며, 2018년 구매 후 현재 사용기간 7년으로 교체를 권장합니다.',
  },
  default: '죄송합니다. 해당 질문에 대한 데이터를 찾지 못했습니다. 다른 방식으로 질문해 주세요.',
};
