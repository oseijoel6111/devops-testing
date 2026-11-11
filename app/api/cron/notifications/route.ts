import { NextResponse } from 'next/server'
import { notifyUpcomingEvents, notifyActiveEvents, sendEngagementReminder } from '@/lib/actions/notification.actions'
import { sendSelectionReminders } from '@/lib/actions/foodMenu.actions'

/**
 * Cron job endpoint for sending automated notifications
 * This should be called by a cron service like Vercel Cron, GitHub Actions, or external cron service
 *
 * Schedule recommendations:
 * - Upcoming events: Run daily at 9 AM
 * - Active events: Run daily at 8 AM
 * - Engagement reminders: Run weekly on Monday at 9 AM
 * - Food selection reminders (type=food-reminder): Run daily; reminds users once per menu closing within 24h
 */
export async function GET(request: Request) {
  try {
    // Verify the request is from authorized source (optional but recommended)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'all'

    const results: {
      upcomingEvents?: Awaited<ReturnType<typeof notifyUpcomingEvents>>
      activeEvents?: Awaited<ReturnType<typeof notifyActiveEvents>>
      engagementReminder?: Awaited<ReturnType<typeof sendEngagementReminder>>
      foodSelectionReminders?: Awaited<ReturnType<typeof sendSelectionReminders>>
    } = {}

    // Send notifications based on type
    if (type === 'upcoming' || type === 'all') {
      results.upcomingEvents = await notifyUpcomingEvents()
    }

    if (type === 'active' || type === 'all') {
      results.activeEvents = await notifyActiveEvents()
    }

    if (type === 'reminder') {
      results.engagementReminder = await sendEngagementReminder()
    }

    if (type === 'food-reminder') {
      results.foodSelectionReminders = await sendSelectionReminders()
    }

    return NextResponse.json({
      success: true,
      message: 'Notifications processed successfully',
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error in notification cron job:', error)
    return NextResponse.json(
      { error: 'Failed to process notifications', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
