import axios from "axios";
import {
    BankHolidayEvents,
    BankHolidays,
    AnnualLeaveEvents,
} from "./arktype.js";
import { config } from "./config.js";
import { dateTimeFormatter, formatDate, pluralize } from "./utils.js";

const MS_IN_AN_HOUR = 3_600_000; // 1000 * 60 * 60;
const WORK_HOURS_IN_DAY = 7.5;
const WORK_DAYS_IN_WEEK = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
] as const;

const leaves = Object.fromEntries(
    config.teamDevelopers.map((developer) => [developer, 0])
);

const fetchAnnualLeaveEvents = async (from: Date, to: Date) => {
    const fromUriComponent = encodeURIComponent(
        from.toISOString().split(".")[0].concat("Z")
    );
    const toUriComponent = encodeURIComponent(
        to.toISOString().split(".")[0].concat("Z")
    );

    const url =
        `https://${config.CONFLUENCE_ROOT_DOMAIN}/rest/calendar-services/1.0/calendar/events.json?subCalendarId=${config.teamAnnualLeaveSubCalendarId}` +
        `&userTimeZoneId=Europe%2FLondon&start=${fromUriComponent}&end=${toUriComponent}`;
    const resp = await axios.get(
        url,
        // NB: Some companies may require you to be on the corporate network for PAT authorization to work
        { headers: { Authorization: `Bearer ${config.CONFLUENCE_PAT}` } }
    );
    if (!resp.data.success) {
        throw new Error(
            `Failed to fetch annual leave events: ${resp.status} ${resp.statusText} ${resp.data}`
        );
    }

    if (resp.data.events === undefined)
        // There's no events in the time range
        return [];

    const events = AnnualLeaveEvents.assert(resp.data.events);

    // For some reason, probably due to a bug in the Confluence API, we receive events that start after the end date.
    // To ensure this function doesn't return these events, we manually filter them out below.
    const annualLeavesInRange = events.filter(
        (event) => event.start.valueOf() < to.valueOf()
    );
    // console.log({ annualLeavesInRange })
    return annualLeavesInRange;
};

const fetchBankHolidays = async (from: Date, to: Date) => {
    const resp = await axios.get("https://www.gov.uk/bank-holidays.json");

    const data = BankHolidays.assert(resp.data);

    const bankHolidaysInRange = data["england-and-wales"].events.filter(
        (event) =>
            from.valueOf() <= event.date.valueOf() &&
            event.date.valueOf() <= to.valueOf()
    );
    // console.log({bankHolidaysInRange})
    return bankHolidaysInRange;
};

const isWorkDay = (date: Date, bankHolidays: BankHolidayEvents) =>
    WORK_DAYS_IN_WEEK.some((workDay) =>
        dateTimeFormatter.format(date).startsWith(workDay)
    ) &&
    !bankHolidays.some(
        (bankHoliday) => formatDate(bankHoliday.date) === formatDate(date)
    );

const getWorkDaysBetween = (
    from_: Date,
    to_: Date,
    bankHolidays: BankHolidayEvents
) => {
    const from = new Date(new Date(from_).setHours(0, 0, 0, 0));
    const to = new Date(new Date(to_).setHours(0, 0, 0, 0));

    let lastDate = from;
    const workDays: Date[] = isWorkDay(from, bankHolidays) ? [from] : [];
    while (lastDate.valueOf() !== to.valueOf()) {
        const nextDay = new Date(
            new Date(lastDate).setDate(lastDate.getDate() + 1)
        );
        if (isWorkDay(nextDay, bankHolidays)) {
            workDays.push(nextDay);
        }
        lastDate = nextDay;
    }
    return workDays;
};

const calculateSprintCapacity = async (sprintStart: Date, sprintEnd: Date) => {
    if (sprintStart.getHours() < 9) sprintStart.setHours(9, 0, 0, 0);
    else sprintStart.setUTCSeconds(0, 0);

    if (`${sprintEnd.getHours()}:${sprintEnd.getMinutes()}` > `17:30`)
        sprintEnd.setHours(17, 30, 0, 0);
    else sprintEnd.setUTCSeconds(0, 0);

    const bankHolidaysInRange = await fetchBankHolidays(sprintStart, sprintEnd);
    const workDaysInRange = getWorkDaysBetween(
        sprintStart,
        sprintEnd,
        bankHolidaysInRange
    );

    const daysLeavePerDay: Record<string, number> = Object.fromEntries(
        workDaysInRange.map((workDay) => [formatDate(workDay), 0])
    );

    let totalDaysOff = 0;
    const events = await fetchAnnualLeaveEvents(sprintStart, sprintEnd);
    events.forEach((event) => {
        if (event.start.valueOf() < sprintStart.valueOf()) {
            // Only count the component of the event that falls within the range [from, to)
            event.start = new Date(sprintStart);
        }

        if (event.end.valueOf() > sprintEnd.valueOf()) {
            // Only count the component of the event that falls within the range [from, to)
            event.end = new Date(sprintEnd);
        }

        const workDaysInEvent = getWorkDaysBetween(
            event.start,
            event.end,
            bankHolidaysInRange
        );
        if (workDaysInEvent.length === 0) return;

        event.invitees.forEach((invitee) => {
            if (leaves[invitee.name] === undefined) {
                console.warn(
                    `WARNING: Found annual leave for ${invitee.name} (aka ${invitee.displayName} / ${invitee.email}), ` +
                        "but they're not hardcoded into the leaves object so their annual leave won't be included in calculations."
                );
                return;
            }

            if (event.allDay) {
                leaves[invitee.name] += workDaysInEvent.length;
                totalDaysOff += workDaysInEvent.length;

                workDaysInEvent.forEach((workDay) => {
                    const dateAsString = formatDate(workDay);
                    daysLeavePerDay[dateAsString] += 1;
                });
            } else {
                const startDateAsString = formatDate(event.start);
                const endDateAsString = formatDate(event.end);
                if (startDateAsString !== endDateAsString) {
                    console.warn(
                        "WARNING: Found an annual leave event that spans multiple days, but is not an all-day event. " +
                            "This is not currently supported, so the event won't be included in the calculations."
                    );
                    return;
                }

                const daysOff =
                    (event.end.valueOf() - event.start.valueOf()) /
                    (MS_IN_AN_HOUR * WORK_HOURS_IN_DAY);
                totalDaysOff += daysOff;
                leaves[invitee.name] += daysOff;
                daysLeavePerDay[startDateAsString] += daysOff;
            }
        });
    });

    const totalNumStaff = Object.keys(leaves).length;
    return {
        bankHolidaysInRange,
        staffPerDay: Object.fromEntries(
            Object.entries(daysLeavePerDay).map(([date, daysOff]) => [
                date,
                totalNumStaff - daysOff,
            ])
        ),
        totalDaysOff,
        totalNumStaff,
        totalWorkDaysInRange: workDaysInRange.length,
    };
};

const formatSprintCapacity = ({
    bankHolidaysInRange,
    staffPerDay,
    totalDaysOff,
    totalNumStaff,
    totalWorkDaysInRange,
}: {
    bankHolidaysInRange: BankHolidayEvents;
    staffPerDay: Record<string, number>;
    totalDaysOff: number;
    totalNumStaff: number;
    totalWorkDaysInRange: number;
}) => {
    const totalStaffPerDay = Object.values(staffPerDay).reduce(
        (acc, curr) => acc + curr,
        0
    );
    const avgStaffPerDay = totalStaffPerDay / totalWorkDaysInRange;

    const numBankHolidays = bankHolidaysInRange.length;
    const bankHolidaysDisclaimer =
        numBankHolidays > 0 ? " (excl bank holidays)" : "";

    const staffPerDayFormatted =
        `${Object.entries(staffPerDay)
            .map(
                ([date, numStaff]) =>
                    `• ${date} - ${numStaff}/${totalNumStaff} staff working (${(
                        (numStaff / totalNumStaff) *
                        100
                    ).toFixed(2)}% capacity)`
            )
            .join("\n")}` +
        `\nAverage staff working per day${bankHolidaysDisclaimer}: ~${avgStaffPerDay.toFixed(
            3
        )} staff ` +
        `(${((avgStaffPerDay / totalNumStaff) * 100).toFixed(
            3
        )}% capacity per day)`;

    const totalCapacityPct =
        (1 - totalDaysOff / (totalWorkDaysInRange * totalNumStaff)) * 100;
    const avgDaysOff = totalDaysOff / totalNumStaff;

    const daysOffPerPersonFormatted =
        `${Object.entries(leaves)
            .map(
                ([email, daysOff]) =>
                    `• ${email} - working ${
                        totalWorkDaysInRange - daysOff
                    }/${totalWorkDaysInRange} ${pluralize(
                        totalWorkDaysInRange,
                        "day"
                    )} ` +
                    `(${((1 - daysOff / totalWorkDaysInRange) * 100).toFixed(
                        2
                    )}% capacity)`
            )
            .join("\n")}` +
        `\nAverage days off per person${bankHolidaysDisclaimer}: ~${avgDaysOff.toFixed(
            1
        )}/${totalWorkDaysInRange} ${pluralize(totalWorkDaysInRange, "day")} ` +
        `(${(100 - (avgDaysOff / totalWorkDaysInRange) * 100).toFixed(
            3
        )}% capacity)` +
        `\nTotal days off${bankHolidaysDisclaimer}: ${totalDaysOff}/${
            totalWorkDaysInRange * totalNumStaff
        } staff ${pluralize(totalDaysOff, "day")} ` +
        `(${(100 - totalCapacityPct).toFixed(
            3
        )}% annual leave / ${totalCapacityPct.toFixed(
            3
        )}% capacity over sprint period)`;

    const padding = "-".repeat(35);
    let returnString = `${padding}\n${staffPerDayFormatted}\n${padding}\n${daysOffPerPersonFormatted}\n${padding}`;

    if (numBankHolidays) {
        const extraDaysOff = numBankHolidays * totalNumStaff;
        const totalCapacityInclBankHols =
            (1 -
                (totalDaysOff + extraDaysOff) /
                    (totalWorkDaysInRange * totalNumStaff + extraDaysOff)) *
            100;

        returnString +=
            `\nThere is ${numBankHolidays} bank ${pluralize(
                numBankHolidays,
                "holiday"
            )} within the time period: ${bankHolidaysInRange
                .map((bankHoliday) => formatDate(bankHoliday.date))
                .join(", ")}` +
            `\nAdjusted total capacity (incl bank holidays): ${totalCapacityInclBankHols.toFixed(
                3
            )}% capacity\n${padding}`;
    }
    return returnString;
};

// // Sample Sprint (with no bank holidays):
// const sprintStart = new Date(Date.UTC(2024, 5, 12, 23, 0, 0)); // event must start at or after this datetime
// const sprintEnd = new Date(Date.UTC(2024, 5, 26, 16, 30, 0)); // event must start before this datetime

// Sample Sprint (with bank holidays):
const sprintStart = new Date(Date.UTC(2024, 3, 28, 23, 0, 0));
const sprintEnd = new Date(Date.UTC(2024, 4, 13, 16, 30, 0));

calculateSprintCapacity(sprintStart, sprintEnd)
    .then((sprintCapacity) => {
        const formattedSprintDuration = dateTimeFormatter.formatRange(
            sprintStart,
            sprintEnd
        );
        console.log(
            `\n\nFrom ${formattedSprintDuration}, the capacity is as follows:\n${formatSprintCapacity(
                sprintCapacity
            )}`
        );
    })
    .catch(console.error);
