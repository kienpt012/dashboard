import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(
    err: any,
    user: any,
    _info: any,
    _context: ExecutionContext,
    _status?: any,
  ): TUser {
    if (err) throw err;
    if (!user) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    return user as TUser;
  }
}

type RoleName = keyof typeof Role;

export const Roles = (...roles: RoleName[]) => SetMetadata('roles', roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<RoleName[]>('roles', [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const role = ctx.switchToHttp().getRequest().user?.role as RoleName | undefined;
    if (!role || !roles.includes(role)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện chức năng này');
    }
    return true;
  }
}
