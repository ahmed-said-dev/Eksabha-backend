import { Request } from 'express';

import { UserAccountType } from '../../users/entities/user.entity';

export interface JwtAccessPayload {
  sub: string;
  sid: string;
  typ: 'access';
  accountType?: UserAccountType;
  selectedTournamentId?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user: JwtAccessPayload;
}
