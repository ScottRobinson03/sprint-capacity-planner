import { scope, Type } from "arktype";
import { dateTimeFormatter } from "./utils.js";

const $ = scope({
    "#AnnualLeaveEvent": [
        {
            "+": "delete",
            className: "'leaves'", //'leaves',
            description: "string",
            // NB: It seems the API confuses 'shortTitle' and 'title' (i.e. 'shortTitle' includes description, but 'title' doesn't)
            shortTitle: "string", //Doe, John (Software Engineer): AL',
            title: "string", //Doe, John (Software Engineer)',
            allDay: "boolean", //true,
            invitees: "User[]",
            end: "parse.date", //'2024-06-12T00:00:00.000+01:00',
            start: "parse.date", //'2024-05-17T00:00:00.000+01:00',
            eventType: "'leaves'", //'leaves',
            subCalendarId: "uuid",
        },
        "=>",
        (event) => ({
            ...event,
            endLocaleFormatted: dateTimeFormatter.format(event.end),
            startLocaleFormatted: dateTimeFormatter.format(event.start),
        }),
    ],
    AnnualLeaveEvents: "AnnualLeaveEvent[]",
    "#BankHolidayEvent": {
        "+": "delete",
        title: "string",
        date: "parse.date",
        notes: "string",
        bunting: "boolean",
    },
    BankHolidays: {
        "+": "delete",
        "england-and-wales": {
            "+": "delete",
            events: "BankHolidayEvent[]",
        },
    },
    "#Name": ["string", "=>", (s) => s.toLowerCase()], // "jde2",
    TeamsConfig: {
        "[string]": {
            annualLeaveSubCalendarId: "uuid",
            developers: "Name[]",
        },
    },
    "#User": {
        "+": "delete",
        displayName: "string", // "Doe, John (Software Engineering)",
        name: "Name",
        email: "email", // "john.doe@ema.il"
    },
});

const exports = $.export();
// NB: We have to parse manually due to a bug in ArkType. Hopefully this will be fixed soon.
export const AnnualLeaveEvents = exports.AnnualLeaveEvents as Type<
    {
        className: string;
        description: string;
        // NB: It seems the API confuses 'shortTitle' and 'title' (i.e. 'shortTitle' includes description, but 'title' doesn't)
        shortTitle: string; // "Doe, John (Software Engineer): AL",
        title: string; // "Doe, John (Software Engineer)"",
        allDay: boolean; //true,
        invitees: { displayName: string; name: string; email: string }[];
        end: Date; //'2024-06-12T00:00:00.000+01:00',
        endLocaleFormatted: string;
        start: Date; //'2024-05-17T00:00:00.000+01:00',
        startLocaleFormatted: string;
        eventType: string; //'leaves',
        subCalendarId: string;
    }[],
    unknown
>;
export const BankHolidays = exports.BankHolidays;
export type BankHolidayEvents =
    (typeof BankHolidays)["infer"]["england-and-wales"]["events"];
// NB: We have to parse manually due to a bug in ArkType. Hopefully this will be fixed soon.
export const TeamsConfig = exports.TeamsConfig as Type<
    {
        [key: string]: {
            annualLeaveSubCalendarId: string;
            developers: string[];
        };
    },
    unknown
>;
