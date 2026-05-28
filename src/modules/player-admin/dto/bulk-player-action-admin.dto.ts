import { ArrayMinSize, IsArray, IsIn, IsString } from 'class-validator';

export class BulkPlayerActionAdminDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  playerIds!: string[];

  @IsIn(['activate', 'deactivate', 'delete'])
  action!: 'activate' | 'deactivate' | 'delete';
}
