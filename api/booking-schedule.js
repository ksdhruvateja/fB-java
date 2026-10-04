import { calendarDate } from './recurring-calendar.js';
export function validateBookingSchedule({ serviceTiming='weekday', preferredTimeSlot='9-11', preferredDate=null }, today=calendarDate(new Date())) {
 if(!['weekday','same-day','evening-weekend'].includes(serviceTiming))return 'Choose a supported service timing.';
 if(!['9-11','11-2','2-5','5-7'].includes(preferredTimeSlot))return 'Choose a supported arrival window.';
 if(preferredDate && (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) || !calendarDate(preferredDate) || preferredDate<today))return 'Choose today or a valid future service date.';
 return null;
}
