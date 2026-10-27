import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SchemaBody, SchemaQuery, SchemaResponse } from '../auth/schema.decorator';
import {
  notificationsResponseSchema,
  notificationResponseSchema,
  notificationPreferencesResponseSchema,
} from '@lms/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  notificationsQuerySchema,
  notificationUpdateSchema,
  notificationsReadAllSchema,
  notificationPreferencesUpdateSchema,
} from '@lms/shared';
import { CurrentUser, type AuthenticatedUser } from '../../common/authz';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { NoStoreInterceptor } from '../auth/no-store.interceptor';
import { NotificationsService } from './notifications.service';
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('me')
@UseInterceptors(NoStoreInterceptor)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @SchemaQuery(notificationsQuerySchema)
  @SchemaResponse(notificationsResponseSchema)
  @Get('notifications')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(notificationsQuerySchema))
    query: ReturnType<typeof notificationsQuerySchema.parse>,
  ) {
    return this.service.list(user.id, query);
  }
  @SchemaBody(notificationUpdateSchema)
  @SchemaResponse(notificationResponseSchema)
  @Patch('notifications/:notificationId')
  mark(
    @CurrentUser() user: AuthenticatedUser,
    @Param('notificationId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(notificationUpdateSchema))
    input: ReturnType<typeof notificationUpdateSchema.parse>,
  ) {
    return this.service.mark(user.id, id, input.read);
  }
  @SchemaBody(notificationsReadAllSchema)
  @Post('notifications/read-all')
  @HttpCode(200)
  readAll(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(notificationsReadAllSchema))
    input: ReturnType<typeof notificationsReadAllSchema.parse>,
  ) {
    return this.service.readAll(user.id, input.through);
  }
  @SchemaResponse(notificationPreferencesResponseSchema)
  @Get('notification-preferences')
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.service.preferences(user.id);
  }
  @SchemaBody(notificationPreferencesUpdateSchema)
  @SchemaResponse(notificationPreferencesResponseSchema)
  @Put('notification-preferences')
  replace(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(notificationPreferencesUpdateSchema))
    input: ReturnType<typeof notificationPreferencesUpdateSchema.parse>,
  ) {
    return this.service.replacePreferences(user.id, input);
  }
}
