import { prisma } from '../utils/db';
import { CreateHolidayDto } from '../types';
import { NotFoundError } from '../types/errors';

export async function listHolidays(orgId: number, year?: number) {
  const where = year
    ? {
        organisationId: orgId,
        date: {
          gte: new Date(`${year}-01-01`),
          lte: new Date(`${year}-12-31`),
        },
      }
    : { organisationId: orgId };

  return prisma.holiday.findMany({
    where,
    orderBy: { date: 'asc' },
  });
}

export async function createHoliday(orgId: number, dto: CreateHolidayDto) {
  return prisma.holiday.create({
    data: {
      organisationId: orgId,
      name: dto.name,
      date: new Date(dto.date),
      recurring: dto.recurring ?? false,
    },
  });
}

export async function deleteHoliday(id: number, orgId: number): Promise<void> {
  const holiday = await prisma.holiday.findFirst({ where: { id, organisationId: orgId } });
  if (!holiday) throw new NotFoundError('Holiday');
  await prisma.holiday.delete({ where: { id } });
}
