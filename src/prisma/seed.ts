import { PrismaClient, UserRole, TimesheetStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('Seeding database...');

  // ---- Organisation ----
  const org = await prisma.organisation.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'Acme Corp' },
  });

  // ---- Org Settings ----
  await prisma.orgSettings.upsert({
    where: { organisationId: org.id },
    update: {},
    create: {
      organisationId: org.id,
      workWeekStart: 'monday',
      standardHours: 8,
      timeFormat: 'decimal',
      timeIncrement: 30,
      maxHoursPerDay: 12,
      maxHoursPerWeek: 60,
      requireApproval: true,
      allowBackdated: true,
      enableOvertime: true,
      mandatoryDesc: false,
      allowCopyWeek: true,
    },
  });

  const BCRYPT_ROUNDS = 12;
  const defaultPassword = await bcrypt.hash('Password123!', BCRYPT_ROUNDS);

  // ---- Users ----
  const admin = await prisma.user.upsert({
    where: { email: 'admin@acme.com' },
    update: {},
    create: {
      organisationId: org.id,
      name: 'Alice Admin',
      email: 'admin@acme.com',
      passwordHash: defaultPassword,
      role: UserRole.ADMIN,
      department: 'Management',
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@acme.com' },
    update: {},
    create: {
      organisationId: org.id,
      name: 'Bob Manager',
      email: 'manager@acme.com',
      passwordHash: defaultPassword,
      role: UserRole.MANAGER,
      department: 'Engineering',
    },
  });

  const employee = await prisma.user.upsert({
    where: { email: 'employee@acme.com' },
    update: {},
    create: {
      organisationId: org.id,
      name: 'Carol Employee',
      email: 'employee@acme.com',
      passwordHash: defaultPassword,
      role: UserRole.EMPLOYEE,
      department: 'Engineering',
    },
  });

  const employee2 = await prisma.user.upsert({
    where: { email: 'employee2@acme.com' },
    update: {},
    create: {
      organisationId: org.id,
      name: 'Dave Developer',
      email: 'employee2@acme.com',
      passwordHash: defaultPassword,
      role: UserRole.EMPLOYEE,
      department: 'Engineering',
    },
  });

  // ---- Manager-Employee Assignments ----
  // Bob Manager manages Carol Employee and Dave Developer
  await prisma.managerEmployee.upsert({
    where: { managerId_employeeId: { managerId: manager.id, employeeId: employee.id } },
    update: {},
    create: { managerId: manager.id, employeeId: employee.id },
  });

  await prisma.managerEmployee.upsert({
    where: { managerId_employeeId: { managerId: manager.id, employeeId: employee2.id } },
    update: {},
    create: { managerId: manager.id, employeeId: employee2.id },
  });

  // Alice Admin also manages Dave Developer (demonstrates many-to-many)
  await prisma.managerEmployee.upsert({
    where: { managerId_employeeId: { managerId: admin.id, employeeId: employee2.id } },
    update: {},
    create: { managerId: admin.id, employeeId: employee2.id },
  });

  // ---- Projects ----
  const project1 = await prisma.project.upsert({
    where: { organisationId_code: { organisationId: org.id, code: 'PRJ-2026-001' } },
    update: {},
    create: {
      organisationId: org.id,
      code: 'PRJ-2026-001',
      name: 'Highspring India TMS Platform',
      client: 'Internal',
      budgetHours: 500,
      usedHours: 0,
      status: 'active',
    },
  });

  const project2 = await prisma.project.upsert({
    where: { organisationId_code: { organisationId: org.id, code: 'PRJ-2026-002' } },
    update: {},
    create: {
      organisationId: org.id,
      code: 'PRJ-2026-002',
      name: 'Client Portal Redesign',
      client: 'Globex Inc',
      budgetHours: 200,
      usedHours: 0,
      status: 'active',
    },
  });

  // ---- Project-Manager Assignments ----
  // Bob Manager manages both projects
  await prisma.projectManager.upsert({
    where: { projectId_managerId: { projectId: project1.id, managerId: manager.id } },
    update: {},
    create: { projectId: project1.id, managerId: manager.id },
  });
  await prisma.projectManager.upsert({
    where: { projectId_managerId: { projectId: project2.id, managerId: manager.id } },
    update: {},
    create: { projectId: project2.id, managerId: manager.id },
  });
  // Alice Admin also assigned to project1
  await prisma.projectManager.upsert({
    where: { projectId_managerId: { projectId: project1.id, managerId: admin.id } },
    update: {},
    create: { projectId: project1.id, managerId: admin.id },
  });

  // ---- Project-Employee Assignments ----
  // Carol Employee assigned to project1
  await prisma.projectEmployee.upsert({
    where: { projectId_employeeId: { projectId: project1.id, employeeId: employee.id } },
    update: {},
    create: { projectId: project1.id, employeeId: employee.id },
  });
  // Dave Developer assigned to both projects
  await prisma.projectEmployee.upsert({
    where: { projectId_employeeId: { projectId: project1.id, employeeId: employee2.id } },
    update: {},
    create: { projectId: project1.id, employeeId: employee2.id },
  });
  await prisma.projectEmployee.upsert({
    where: { projectId_employeeId: { projectId: project2.id, employeeId: employee2.id } },
    update: {},
    create: { projectId: project2.id, employeeId: employee2.id },
  });

  // ---- Holidays ----
  await prisma.holiday.upsert({
    where: { id: 1 },
    update: {},
    create: {
      organisationId: org.id,
      name: "New Year's Day",
      date: new Date('2026-01-01'),
      recurring: true,
    },
  });

  await prisma.holiday.upsert({
    where: { id: 2 },
    update: {},
    create: {
      organisationId: org.id,
      name: 'Christmas Day',
      date: new Date('2026-12-25'),
      recurring: true,
    },
  });

  // ---- Sample Timesheet for employee ----
  const weekStart = new Date('2026-02-09'); // Monday of the previous week
  const weekEnd = new Date('2026-02-15');

  const timesheet = await prisma.timesheet.upsert({
    where: { id: 1 },
    update: {},
    create: {
      organisationId: org.id,
      userId: employee.id,
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      status: TimesheetStatus.SUBMITTED,
      totalHours: 32,
      billableHours: 24,
    },
  });

  await prisma.timeEntry.upsert({
    where: { id: 1 },
    update: {},
    create: {
      timesheetId: timesheet.id,
      projectId: project1.id,
      description: 'API development and testing',
      billable: true,
      monHours: 8,
      tueHours: 8,
      wedHours: 8,
      totalHours: 24,
    },
  });

  await prisma.timeEntry.upsert({
    where: { id: 2 },
    update: {},
    create: {
      timesheetId: timesheet.id,
      projectId: project2.id,
      description: 'Design review meetings',
      billable: false,
      thuHours: 4,
      friHours: 4,
      totalHours: 8,
    },
  });

  // ---- Sample notification ----
  await prisma.notification.upsert({
    where: { id: 1 },
    update: {},
    create: {
      userId: employee.id,
      type: 'timesheet_due',
      message: 'Your timesheet for this week is due by Friday 5:00 PM.',
      read: false,
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete.');
  // eslint-disable-next-line no-console
  console.log('Seed credentials:');
  // eslint-disable-next-line no-console
  console.log('  Admin:     admin@acme.com     / Password123!');
  // eslint-disable-next-line no-console
  console.log('  Manager:   manager@acme.com   / Password123!');
  // eslint-disable-next-line no-console
  console.log('  Employee:  employee@acme.com  / Password123!');
  // eslint-disable-next-line no-console
  console.log('  Employee2: employee2@acme.com / Password123!');
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('Manager-Employee assignments:');
  // eslint-disable-next-line no-console
  console.log('  Bob Manager   → Carol Employee, Dave Developer');
  // eslint-disable-next-line no-console
  console.log('  Alice Admin   → Dave Developer');

  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('Project-Manager assignments:');
  // eslint-disable-next-line no-console
  console.log('  Bob Manager   → PRJ-2026-001, PRJ-2026-002');
  // eslint-disable-next-line no-console
  console.log('  Alice Admin   → PRJ-2026-001');

  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('Project-Employee assignments:');
  // eslint-disable-next-line no-console
  console.log('  Carol Employee → PRJ-2026-001');
  // eslint-disable-next-line no-console
  console.log('  Dave Developer → PRJ-2026-001, PRJ-2026-002');

  void admin;
  void employee2;
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
