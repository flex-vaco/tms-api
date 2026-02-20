import { prisma } from '../utils/db';
import { UpdateSettingsDto } from '../types';
import { NotFoundError } from '../types/errors';

export async function getSettings(orgId: number) {
  const settings = await prisma.orgSettings.findUnique({ where: { organisationId: orgId } });
  if (!settings) throw new NotFoundError('Organisation settings');
  return settings;
}

export async function updateSettings(orgId: number, dto: UpdateSettingsDto) {
  // upsert — create settings row if it doesn't exist yet (graceful for orgs missing one)
  return prisma.orgSettings.upsert({
    where: { organisationId: orgId },
    update: dto,
    create: { organisationId: orgId, ...dto },
  });
}
