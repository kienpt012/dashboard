import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { translateConstraint, validationExceptionFactory, validationMessages } from '../src/validation-messages';

class ChildDto {
  @IsString() @MinLength(3) title!: string;
}

class SampleDto {
  @IsInt() @Min(1) expectedPublicationVersion!: number;
  @IsString() @MaxLength(5) code!: string;
  @IsInt() @Min(2000) @Max(2100, { message: 'Năm phải từ 2000 đến 2100' }) year!: number;
  @ValidateNested() @Type(() => ChildDto) child!: ChildDto;
}

async function errorsOf(body: unknown) {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory });
  try {
    await pipe.transform(body, { type: 'body', metatype: SampleDto });
    return [];
  } catch (error) {
    return (error as { getResponse(): { message: string[] } }).getResponse().message;
  }
}

test('thông báo mặc định tiếng Anh được chuyển sang tiếng Việt, kèm tên trường dễ hiểu', async () => {
  const messages = await errorsOf({ expectedPublicationVersion: 0, code: 'ABCDEFG', year: 2026, child: { title: 'ab' } });
  assert.ok(messages.includes('Phiên bản công bố không được nhỏ hơn 1'));
  assert.ok(messages.includes('Mã không được quá 5 ký tự'));
  assert.ok(messages.includes('Tiêu đề (child.title) cần ít nhất 3 ký tự'));
  assert.ok(messages.every(message => !/must|should|longer|shorter/.test(message)));
});

test('thông báo tiếng Việt do DTO tự đặt được giữ nguyên', async () => {
  const messages = await errorsOf({ expectedPublicationVersion: 1, code: 'A', year: 1999, child: { title: 'abc' } });
  assert.deepEqual(messages, ['Năm không được nhỏ hơn 2000', 'Năm phải từ 2000 đến 2100'].filter(message => messages.includes(message)));
  assert.ok(messages.includes('Năm không được nhỏ hơn 2000'));
});

test('trường lạ bị từ chối bằng tiếng Việt và phản hồi giữ dạng mặc định của Nest', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory });
  try {
    await pipe.transform({ expectedPublicationVersion: 1, code: 'A', year: 2026, child: { title: 'abc' }, hacker: true }, { type: 'body', metatype: SampleDto });
    assert.fail('phải từ chối');
  } catch (error) {
    const response = (error as { getResponse(): { message: string[]; error: string; statusCode: number } }).getResponse();
    assert.equal(response.statusCode, 400);
    assert.equal(response.error, 'Bad Request');
    assert.deepEqual(response.message, ['Trường «hacker» không được phép gửi lên']);
  }
});

test('ràng buộc chưa có mẫu vẫn ra câu tiếng Việt, không lộ tiếng Anh', () => {
  assert.equal(translateConstraint('isLatLong', 'location must be a latitude,longitude string', 'location'), 'Trường «location» không hợp lệ');
  assert.equal(validationMessages([]).length, 0);
});
