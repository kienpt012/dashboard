import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TargetDirection,
  TargetFrequency,
  TargetStatus,
} from '@prisma/client';
import { PublicController, publicDepartmentKey } from '../src/public';

function publishedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'target-1',
    departmentId: 'dep-1',
    code: 'LIVE-CODE',
    title: 'Tên nội bộ đã sửa',
    description: 'Mô tả nội bộ đã sửa',
    unit: 'hồ sơ',
    weight: 1,
    year: 2027,
    frequency: TargetFrequency.MONTHLY,
    dueDate: new Date('2027-12-31T16:59:59.999Z'),
    isHighlighted: false,
    publicOrder: 99,
    department: { name: 'Đơn vị hiện tại', color: '#999999' },
    publishedTargetValue: 100,
    publishedValue: 75,
    publishedDirection: TargetDirection.HIGHER_IS_BETTER,
    publishedStatus: TargetStatus.ON_TRACK,
    publishedCode: 'CT-2026-DV-001',
    publishedTitle: 'Tên tại thời điểm công bố',
    publishedDescription: 'Mô tả tại thời điểm công bố',
    publishedUnit: '%',
    publishedWeight: 2,
    publishedYear: 2026,
    publishedFrequency: TargetFrequency.YEARLY,
    publishedDueDate: new Date('2026-12-31T16:59:59.999Z'),
    publishedDepartmentName: 'Phòng dùng chung tên',
    publishedDepartmentColor: '#225577',
    publishedHighlighted: true,
    publishedOrder: 1,
    publishedAt: new Date('2026-07-20T10:00:00.000Z'),
    ...overrides,
  };
}

test('trang vượt quá pageCount trả đúng trang rỗng, không kẹp về trang cuối', async () => {
  let listArgs: any;
  const controller = new PublicController({
    target: {
      count: async () => 7,
      findMany: async (args: any) => {
        listArgs = args;
        return [];
      },
    },
  } as any);

  const response = await controller.targets({
    year: 2026,
    page: 3,
    pageSize: 6,
  } as any);

  assert.equal(response.page, 3);
  assert.equal(response.pageCount, 2);
  assert.deepEqual(response.items, []);
  assert.equal(listArgs.skip, 12);
  assert.equal(listArgs.take, 6);
  assert.deepEqual(listArgs.orderBy, [
    { publishedHighlighted: 'desc' },
    { publishedOrder: 'asc' },
    { code: 'asc' },
    { id: 'asc' },
  ]);
  assert.equal(
    listArgs.orderBy.some((item: Record<string, unknown>) => 'publishedAt' in item),
    false,
  );
});

test('lọc bằng khóa phòng ban ổn định và phân trang trực tiếp ở DB', async () => {
  const selectedName = 'Phòng dùng chung tên';
  const selectedColor = '#225577';
  const selectedKey = publicDepartmentKey('dep-2');
  let pageQuery: any;
  let findManyCalls = 0;
  const row = publishedRow();
  const controller = new PublicController({
    target: {
      count: async (args: any) => {
        assert.equal(args.where.AND[1].departmentId, 'dep-2');
        assert.equal(args.where.AND.length, 2);
        return 2;
      },
      findMany: async (args: any) => {
        findManyCalls += 1;
        if (args.distinct) {
          assert.deepEqual(args.distinct, ['departmentId']);
          return [
            { departmentId: 'dep-1' },
            { departmentId: 'dep-2' },
          ];
        }
        pageQuery = args;
        return [
          {
            ...row,
            id: 'target-old',
            departmentId: 'dep-2',
            publishedDepartmentName: 'Tên đơn vị trước khi cập nhật',
            publishedDepartmentColor: '#445566',
            publishedAt: new Date('2026-07-19T10:00:00.000Z'),
          },
          {
            ...row,
            id: 'target-new',
            departmentId: 'dep-2',
            publishedAt: new Date('2026-07-20T10:00:00.000Z'),
          },
        ];
      },
    },
  } as any);

  const response = await controller.targets({
    year: 2026,
    page: 1,
    pageSize: 6,
    department: selectedKey,
  } as any);

  assert.equal(findManyCalls, 2);
  assert.equal(pageQuery.skip, 0);
  assert.equal(pageQuery.take, 6);
  assert.deepEqual(pageQuery.orderBy, [
    { publishedHighlighted: 'desc' },
    { publishedOrder: 'asc' },
    { code: 'asc' },
    { id: 'asc' },
  ]);
  assert.equal(response.department, selectedKey);
  assert.equal(response.items[0].departmentKey, selectedKey);
  assert.equal(response.items[1].departmentKey, selectedKey);
  assert.equal(response.items[0].department, 'Tên đơn vị trước khi cập nhật');
  assert.equal(response.items[1].department, selectedName);
  assert.equal(response.items[1].departmentColor, selectedColor);
  assert.equal(response.items[0].code, row.publishedCode);
  assert.equal(response.items[0].title, row.publishedTitle);
  assert.equal(response.items[0].year, row.publishedYear);
  assert.notEqual(response.items[0].key, row.id);
});

test('overview chỉ tạo một nhóm khi cùng phòng ban có snapshot tên và màu khác nhau', async () => {
  const older = publishedRow({
    id: 'target-old',
    departmentId: 'dep-same',
    publishedDepartmentName: 'Tên đơn vị cũ',
    publishedDepartmentColor: '#111111',
    publishedAt: new Date('2026-07-19T10:00:00.000Z'),
  });
  const newer = publishedRow({
    id: 'target-new',
    departmentId: 'dep-same',
    publishedDepartmentName: 'Tên đơn vị hiện hành',
    publishedDepartmentColor: '#227766',
    publishedAt: new Date('2026-07-20T10:00:00.000Z'),
  });
  const controller = new PublicController({
    target: { findMany: async () => [older, newer] },
  } as any);

  const response = await controller.overview({ year: 2026 });

  assert.equal(response.total, 2);
  assert.equal(response.departments.length, 1);
  assert.equal(response.departments[0].key, publicDepartmentKey('dep-same'));
  assert.equal(response.departments[0].name, 'Tên đơn vị hiện hành');
  assert.equal(response.departments[0].color, '#227766');
});
