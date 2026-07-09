import React from 'react';

export const ASSET_STATUS = {
  ACTIVE: { label: '활성', color: 'green' },
  INACTIVE: { label: '비활성', color: 'gray' },
  REPLACEMENT_NEEDED: { label: '교체 필요', color: 'red' },
  UNDER_MAINTENANCE: { label: '유지보수 중', color: 'yellow' },
};

export const FILE_STATUS = {
  PENDING: { label: '대기', color: 'gray' },
  PROCESSING: { label: '분석중', color: 'blue' },
  COMPLETED: { label: '완료', color: 'green' },
  FAILED: { label: '실패', color: 'red' },
};

export const MAINTENANCE_TYPE = {
  ROUTINE: { label: '정기점검', color: 'blue' },
  REPAIR: { label: '수리', color: 'orange' },
  REPLACEMENT: { label: '교체', color: 'purple' },
  INSPECTION: { label: '점검', color: 'gray' },
};

// Tailwind's JIT scanner only keeps classes it can see written literally in
// source files, so the class name must not be built dynamically (e.g. via
// `badge-${color}` template strings) or it gets purged from the build.
const COLOR_CLASSES = {
  green: 'badge-green',
  red: 'badge-red',
  yellow: 'badge-yellow',
  blue: 'badge-blue',
  gray: 'badge-gray',
  purple: 'badge-purple',
  orange: 'badge-orange',
};

function Badge({ map, value }) {
  const entry = map[value] || { label: value, color: 'gray' };
  return <span className={COLOR_CLASSES[entry.color] || COLOR_CLASSES.gray}>{entry.label}</span>;
}

export function AssetStatusBadge({ status }) {
  return <Badge map={ASSET_STATUS} value={status} />;
}

export function FileStatusBadge({ status }) {
  return <Badge map={FILE_STATUS} value={status} />;
}

export function MaintenanceTypeBadge({ type }) {
  return <Badge map={MAINTENANCE_TYPE} value={type} />;
}
