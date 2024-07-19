import "dotenv/config";
import axios from "axios";

const response = await axios.get(
    `https://${process.env.CONFLUENCE_ROOT_DOMAIN}/rest/calendar-services/1.0/calendar/subcalendars.json?calendarContext=spaceCalendars&viewingSpaceKey=${process.env.CONFLUENCE_SPACE_KEY}`,
    { headers: { Authorization: `Bearer ${process.env.CONFLUENCE_PAT}` } }  
);

const getAnnualLeaveSubCalendars = (calendars, foundAnnualLeaveSubCalendars) => {
    let newAnnualLeaveSubCalendars = [];

    for (const calendar of calendars) {
        if (calendar.subCalendar.typeKey.endsWith("type.leaves")) {
            newAnnualLeaveSubCalendars.push(calendar.subCalendar);
            continue;
        }

        if (calendar.subCalendar.typeKey.endsWith("type.parent")) {
            newAnnualLeaveSubCalendars = [
                ...newAnnualLeaveSubCalendars,
                ...getAnnualLeaveSubCalendars(calendar.childSubCalendars, foundAnnualLeaveSubCalendars)
            ]
        }
    }

    return [...foundAnnualLeaveSubCalendars, ...newAnnualLeaveSubCalendars]
}

const annualLeaveSubCalendars = getAnnualLeaveSubCalendars(response.data.payload, []);
console.log(JSON.stringify({ annualLeaveSubCalendars }, null, 2))
