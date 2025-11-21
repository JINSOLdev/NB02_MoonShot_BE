import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // 1. Authorization 헤더 또는 쿠키에서 토큰 추출
    const authHeader = req.headers['authorization'];
    let token: string | undefined;

    if (typeof authHeader === 'string') {
      token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    } else if (req.cookies?.['access-token']) {
      token = req.cookies['access-token'];
    }

    if (!token) {
      return res.status(401).json({ message: '인증 토큰이 없습니다.' });
    }

    // 2. 토큰 검증
    const decoded = jwt.verify(
      token,
      process.env.JWT_ACCESS_TOKEN_SECRET as string
    ) as jwt.JwtPayload;

    // 3. req.user에 저장
    (req as any).user = {
      id: decoded.sub,
    };

    next();
  } catch (error: any) {
    return res.status(401).json({ message: '인증 실패', reason: error.message });
  }
}
