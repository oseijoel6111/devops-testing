"use server";

import { revalidatePath } from "next/cache";
import prisma from "../prisma";
import { createNotification, createNotificationForAllUsers } from "./notification.actions";
import { getAuthAppUrl } from "../auth-app-url";
import { sendEmail } from "../email";
import { foodMenuPublishedTemplate, foodSelectionReminderTemplate } from "../email-templates";
import { requireFoodCommitteeOrAdmin, requireAuthenticatedUser } from '@/lib/security';
import { isValidPrismaId, sanitizeText } from '@/lib/utils/validators';
import { runAfterResponse } from '@/lib/background-work';
import { deliverFoodMenuWhatsApp } from '@/lib/jobs/food-menu-whatsapp';

// ============================================
// WEEKLY FOOD MENU MANAGEMENT
// ============================================

export async function fetchAllFoodMenus() {
  try {
    const menus = await prisma.weeklyFoodMenu.findMany({
      where: { isActive: true },
      include: {
        vendor: true,
        menuItems: {
          orderBy: [{ dayOfWeek: 'asc' }, { displayOrder: 'asc' }]
        },
        _count: {
          select: { selections: true }
        }
      },
      orderBy: { weekStartDate: 'desc' }
    });

    return {
      success: true,
      menus,
      totalMenus: menus.length
    };
  } catch (error) {
    console.error('Food menu fetch error:', error);
    return { error: 'Failed to fetch food menus' };
  }
}

export async function fetchFoodMenuById(menuId: string) {
  try {
    if (!isValidPrismaId(menuId)) {
      return { error: 'Invalid menu ID' };
    }
    
    const menu = await prisma.weeklyFoodMenu.findUnique({
      where: { id: menuId },
      include: {
        vendor: true,
        menuItems: {
          orderBy: [{ dayOfWeek: 'asc' }, { displayOrder: 'asc' }]
        },
        _count: {
          select: { selections: true }
        }
      }
    });

    if (!menu) {
      return { error: 'Food menu not found' };
    }

    return { success: true, menu };
  } catch (error) {
    console.error('Food menu fetch error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to fetch food menu' };
  }
}

export async function fetchActiveFoodMenus() {
  try {
    const now = new Date();

    const menus = await prisma.weeklyFoodMenu.findMany({
      where: {
        isActive: true,
        status: 'PUBLISHED',
        selectionOpenDate: { lte: now },
        selectionCloseDate: { gte: now }
      },
      include: {
        vendor: true,
        menuItems: {
          where: { isAvailable: true },
          include: {
            food: {
              include: {
                vendorItems: { include: { vendor: true } }
              }
            }
          },
          orderBy: [{ dayOfWeek: 'asc' }, { displayOrder: 'asc' }]
        }
      },
      orderBy: { weekStartDate: 'asc' }
    });

    return {
      success: true,
      menus
    };
  } catch (error) {
    console.error('Active food menus fetch error:', error);
    return { error: 'Failed to fetch active food menus' };
  }
}

interface CreateMenuData {
  vendorId: string;
  weekStartDate: string;
  weekEndDate: string;
  selectionOpenDate: string;
  selectionCloseDate: string;
  menuItems: Array<{
    dayOfWeek: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY';
    foodId?: string;
    itemName: string;
    description?: string;
    price?: number;
    isAvailable?: boolean;
    displayOrder?: number;
  }>;
}

export async function createFoodMenu(data: CreateMenuData) {
  try {
    await requireFoodCommitteeOrAdmin();
    
    const user = await requireAuthenticatedUser();
    
    if (!isValidPrismaId(data.vendorId)) {
      return { error: 'Invalid vendor ID' };
    }

    const weekStartDate = new Date(data.weekStartDate);
    const weekEndDate = new Date(data.weekEndDate);
    const selectionOpenDate = new Date(data.selectionOpenDate);
    const selectionCloseDate = new Date(data.selectionCloseDate);

    if (weekEndDate <= weekStartDate) {
      return { error: 'Week end date must be after week start date' };
    }

    if (selectionCloseDate <= selectionOpenDate) {
      return { error: 'Selection close date must be after selection open date' };
    }

    const sanitizedData = {
      ...data,
      menuItems: data.menuItems.map((item) => ({
        ...item,
        itemName: sanitizeText(item.itemName),
        description: item.description ? sanitizeText(item.description) : null,
        foodId: item.foodId && isValidPrismaId(item.foodId) ? item.foodId : null
      }))
    };

    console.log('[createFoodMenu] vendorId:', sanitizedData.vendorId, 'items:', sanitizedData.menuItems.map(i => ({ day: i.dayOfWeek, foodId: i.foodId, itemName: i.itemName })));

    const menu = await prisma.weeklyFoodMenu.create({
      data: {
        vendorId: sanitizedData.vendorId,
        weekStartDate,
        weekEndDate,
        selectionOpenDate,
        selectionCloseDate,
        status: 'DRAFT',
        createdBy: user.id,
        menuItems: {
          create: sanitizedData.menuItems.map((item) => ({
            dayOfWeek: item.dayOfWeek,
            foodId: item.foodId,
            itemName: item.itemName,
            description: item.description,
            price: item.price || null,
            isAvailable: item.isAvailable ?? true,
            displayOrder: item.displayOrder ?? 0
          }))
        }
      },
      include: {
        vendor: true,
        menuItems: true
      }
    });

    console.log('[createFoodMenu] created menu:', menu.id, 'menuItems saved:', menu.menuItems.length);

    revalidatePath('/admin/food-management/menus');
    return { success: true, menu };
  } catch (error) {
    console.error('[createFoodMenu] Food menu creation error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to create food menu' };
  }
}

export async function updateFoodMenu(menuId: string, data: CreateMenuData) {
  try {
    await requireFoodCommitteeOrAdmin();
    
    if (!isValidPrismaId(menuId)) {
      return { error: 'Invalid menu ID' };
    }
    
    if (!isValidPrismaId(data.vendorId)) {
      return { error: 'Invalid vendor ID' };
    }
    
    const weekStartDate = new Date(data.weekStartDate);
    const weekEndDate = new Date(data.weekEndDate);
    const selectionOpenDate = new Date(data.selectionOpenDate);
    const selectionCloseDate = new Date(data.selectionCloseDate);
    
    if (weekEndDate <= weekStartDate) {
      return { error: 'Week end date must be after week start date' };
    }
    
    if (selectionCloseDate <= selectionOpenDate) {
      return { error: 'Selection close date must be after selection open date' };
    }
    
    const sanitizedData = {
      ...data,
      menuItems: data.menuItems.map((item) => ({
        ...item,
        itemName: sanitizeText(item.itemName),
        description: item.description ? sanitizeText(item.description) : null,
        foodId: item.foodId && isValidPrismaId(item.foodId) ? item.foodId : null
      }))
    };
    
    // Check if menu is still in DRAFT status
    const existingMenu = await prisma.weeklyFoodMenu.findUnique({
      where: { id: menuId },
      select: { status: true }
    });

    if (!existingMenu) {
      return { error: 'Menu not found' };
    }

    if (existingMenu.status !== 'DRAFT') {
      return { error: 'Can only update menus in DRAFT status' };
    }

    console.log('[updateFoodMenu] menuId:', menuId, 'vendorId:', sanitizedData.vendorId, 'items:', sanitizedData.menuItems.map(i => ({ day: i.dayOfWeek, foodId: i.foodId, itemName: i.itemName })));

    // Delete existing menu items and create new ones
    await prisma.foodMenuItem.deleteMany({
      where: { menuId }
    });

    const menu = await prisma.weeklyFoodMenu.update({
      where: { id: menuId },
      data: {
        vendorId: sanitizedData.vendorId,
        weekStartDate,
        weekEndDate,
        selectionOpenDate,
        selectionCloseDate,
        menuItems: {
          create: sanitizedData.menuItems.map((item) => ({
            dayOfWeek: item.dayOfWeek,
            foodId: item.foodId,
            itemName: item.itemName,
            description: item.description,
            price: item.price || null,
            isAvailable: item.isAvailable ?? true,
            displayOrder: item.displayOrder ?? 0
          }))
        }
      },
      include: {
        vendor: true,
        menuItems: true
      }
    });

    console.log('[updateFoodMenu] updated menu:', menu.id, 'menuItems saved:', menu.menuItems.length);

    revalidatePath('/admin/food-management/menus');
    return { success: true, menu };
  } catch (error) {
    console.error('[updateFoodMenu] Food menu update error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to update food menu' };
  }
}

/**
 * Updates only the selection deadline for a menu. Unlike `updateFoodMenu`, this never
 * touches menuItems or selections, and works regardless of the menu's status — so
 * extending/shortening a deadline never disturbs the menu or selections already made.
 */
export async function updateFoodMenuDeadline(menuId: string, selectionCloseDate: string) {
  try {
    await requireFoodCommitteeOrAdmin();

    if (!isValidPrismaId(menuId)) {
      return { error: 'Invalid menu ID' };
    }

    const newCloseDate = new Date(selectionCloseDate);
    if (isNaN(newCloseDate.getTime())) {
      return { error: 'Invalid deadline date' };
    }

    const menu = await prisma.weeklyFoodMenu.findUnique({
      where: { id: menuId },
      select: { selectionOpenDate: true }
    });

    if (!menu) {
      return { error: 'Menu not found' };
    }

    if (newCloseDate <= menu.selectionOpenDate) {
      return { error: 'Deadline must be after the selection open date' };
    }

    await prisma.weeklyFoodMenu.update({
      where: { id: menuId },
      data: { selectionCloseDate: newCloseDate }
    });

    revalidatePath('/admin/food-management/menus');
    revalidatePath(`/admin/food-management/orders/${menuId}`);
    revalidatePath('/food-orders');
    return { success: true };
  } catch (error) {
    console.error('[updateFoodMenuDeadline] Food menu deadline update error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to update deadline' };
  }
}

export async function publishFoodMenu(menuId: string) {
  try {
    await requireFoodCommitteeOrAdmin();
    
    if (!isValidPrismaId(menuId)) {
      return { error: 'Invalid menu ID' };
    }
    
    const menu = await prisma.weeklyFoodMenu.findUnique({
      where: { id: menuId },
      include: { vendor: true, menuItems: true }
    });

    if (!menu) {
      return { error: 'Menu not found' };
    }

    if (menu.status !== 'DRAFT') {
      return { error: 'Menu is already published' };
    }

    // Update menu status to PUBLISHED
    await prisma.weeklyFoodMenu.update({
      where: { id: menuId },
      data: {
        status: 'PUBLISHED',
        notificationSent: true
      }
    });

    // Get all active users
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, email: true, name: true, firstName: true, phoneNumber: true }
    });

    // Create notifications for all users
    const weekStart = menu.weekStartDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
    const weekEnd = menu.weekEndDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    await createNotificationForAllUsers({
      type: 'FOOD_MENU_PUBLISHED',
      title: `${menu.vendor.name} - Weekly Menu Available`,
      message: `The food menu for ${weekStart} - ${weekEnd} is now available. Make your selections before ${menu.selectionCloseDate.toLocaleDateString()}.`,
      linkUrl: '/food-orders'
    });

    // Send email notifications to all active users
    const emailPromises = users.map((user) =>
      sendEmail({
        to: user.email,
        subject: `${menu.vendor.name} - Weekly Food Menu Available`,
        html: foodMenuPublishedTemplate({
          userName: user.name,
          vendorName: menu.vendor.name,
          weekStartDate: menu.weekStartDate,
          weekEndDate: menu.weekEndDate,
          selectionCloseDate: menu.selectionCloseDate,
          linkUrl: getAuthAppUrl("/food-orders")
        })
      })
    );

    // Use Promise.allSettled to ensure all emails are sent even if some fail
    const emailResults = await Promise.allSettled(emailPromises);

    // Log any failed emails for debugging
    const failedEmails = emailResults.filter(result => result.status === 'rejected');
    if (failedEmails.length > 0) {
      console.error(`Failed to send ${failedEmails.length} out of ${users.length} emails:`, failedEmails);
    } else {
      console.log(`Successfully sent ${users.length} email notifications`);
    }

    // WhatsApp DMs are paced by the worker, so hand them off after the response.
    runAfterResponse(() => deliverFoodMenuWhatsApp({ event: 'published', menu, users }));

    revalidatePath('/admin/food-management/menus');
    revalidatePath('/food-orders');
    return { success: true };
  } catch (error) {
    console.error('Food menu publish error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to publish food menu' };
  }
}

export async function closeFoodMenuSelection(menuId: string) {
  try {
    await requireFoodCommitteeOrAdmin();
    
    if (!isValidPrismaId(menuId)) {
      return { error: 'Invalid menu ID' };
    }
    
    await prisma.weeklyFoodMenu.update({
      where: { id: menuId },
      data: { status: 'CLOSED' }
    });

    revalidatePath('/admin/food-management/menus');
    revalidatePath('/food-orders');
    return { success: true };
  } catch (error) {
    console.error('Food menu close error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to close food menu selection' };
  }
}

export async function markFoodMenuAsSent(menuId: string) {
  try {
    await requireFoodCommitteeOrAdmin();
    
    if (!isValidPrismaId(menuId)) {
      return { error: 'Invalid menu ID' };
    }
    
    await prisma.weeklyFoodMenu.update({
      where: { id: menuId },
      data: { status: 'SENT' }
    });

    revalidatePath('/admin/food-management/menus');
    return { success: true };
  } catch (error) {
    console.error('Food menu mark as sent error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to mark menu as sent' };
  }
}

export async function revertMenuToDraft(menuId: string) {
  try {
    await requireFoodCommitteeOrAdmin();
    
    if (!isValidPrismaId(menuId)) {
      return { error: 'Invalid menu ID' };
    }
    
    const menu = await prisma.weeklyFoodMenu.findUnique({
      where: { id: menuId },
      select: { status: true }
    });

    if (!menu) {
      return { error: 'Menu not found' };
    }

    if (menu.status === 'DRAFT') {
      return { error: 'Menu is already in DRAFT status' };
    }

    await prisma.weeklyFoodMenu.update({
      where: { id: menuId },
      data: { status: 'DRAFT' }
    });

    revalidatePath('/admin/food-management/menus');
    return { success: true };
  } catch (error) {
    console.error('Menu revert error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to revert menu to draft' };
  }
}

export async function deleteFoodMenu(menuId: string) {
  try {
    await requireFoodCommitteeOrAdmin();
    
    if (!isValidPrismaId(menuId)) {
      return { error: 'Invalid menu ID' };
    }
    
    const menu = await prisma.weeklyFoodMenu.findUnique({
      where: { id: menuId },
      select: { status: true }
    });

    if (!menu) {
      return { error: 'Menu not found' };
    }

    if (menu.status !== 'DRAFT') {
      return { error: 'Can only delete menus in DRAFT status' };
    }

    await prisma.weeklyFoodMenu.update({
      where: { id: menuId },
      data: { isActive: false }
    });

    revalidatePath('/admin/food-management/menus');
    return { success: true };
  } catch (error) {
    console.error('Food menu deletion error:', error);
    return { error: error instanceof Error ? error.message : 'Failed to delete food menu' };
  }
}

export async function sendSelectionReminders() {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find menus closing within 24 hours that haven't sent reminders
    const menusToRemind = await prisma.weeklyFoodMenu.findMany({
      where: {
        status: 'PUBLISHED',
        selectionCloseDate: {
          gte: now,
          lte: tomorrow
        },
        reminderSent: false
      },
      include: {
        vendor: true
      }
    });

    for (const menu of menusToRemind) {
      // Get users who haven't made selections
      const allUsers = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, email: true, name: true, firstName: true, phoneNumber: true }
      });

      const usersWithSelections = await prisma.foodSelection.findMany({
        where: { menuId: menu.id },
        select: { userId: true },
        distinct: ['userId']
      });

      const userIdsWithSelections = new Set(usersWithSelections.map((s) => s.userId));
      const usersWithoutSelections = allUsers.filter((u) => !userIdsWithSelections.has(u.id));

      // Send in-app reminders to users who haven't made selections
      const notificationPromises = usersWithoutSelections.map((user) =>
        createNotification({
          userId: user.id,
          type: 'FOOD_SELECTION_REMINDER',
          title: 'Reminder: Food Selection Deadline Approaching',
          message: `Don't forget to make your food selections for ${menu.vendor.name}. Deadline: ${menu.selectionCloseDate.toLocaleDateString()}.`,
          linkUrl: '/food-orders'
        })
      );

      // Send email reminders to users who haven't made selections
      const emailPromises = usersWithoutSelections.map((user) =>
        sendEmail({
          to: user.email,
          subject: 'Reminder: Food Selection Deadline Approaching',
          html: foodSelectionReminderTemplate({
            userName: user.name,
            vendorName: menu.vendor.name,
            selectionCloseDate: menu.selectionCloseDate,
            linkUrl: getAuthAppUrl("/food-orders")
          })
        })
      );

      const results = await Promise.allSettled([...notificationPromises, ...emailPromises]);

      // Log any failed emails for debugging
      const failedEmails = results.filter(result => result.status === 'rejected');
      if (failedEmails.length > 0) {
        console.error(`Failed to send ${failedEmails.length} reminder emails for menu ${menu.id}:`, failedEmails);
      } else {
        console.log(`Successfully sent ${usersWithoutSelections.length} reminder emails for menu ${menu.id}`);
      }

      // Awaited here because this runs from a cron route, not a server action.
      await deliverFoodMenuWhatsApp({ event: 'reminder', menu, users: usersWithoutSelections });

      // Mark reminder as sent
      await prisma.weeklyFoodMenu.update({
        where: { id: menu.id },
        data: { reminderSent: true }
      });
    }

    return { success: true, remindersCount: menusToRemind.length };
  } catch (error) {
    console.error('Send selection reminders error:', error);
    return { error: 'Failed to send selection reminders' };
  }
}
