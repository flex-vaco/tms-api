import { prisma } from '../utils/db';
import { NotFoundError } from '../types/errors';

export async function listNotifications(userId: number) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function markAsRead(id: number, userId: number) {
  const notification = await prisma.notification.findFirst({ where: { id, userId } });
  if (!notification) throw new NotFoundError('Notification');

  return prisma.notification.update({ where: { id }, data: { read: true } });
}

export async function markAllAsRead(userId: number): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
}
