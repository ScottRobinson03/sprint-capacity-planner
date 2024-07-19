import "dotenv/config";
import { TeamsConfig } from "./arktype.js";
import unvalidatedTeams from "./teams.json" with { type: "json" };

const teams = TeamsConfig.assert(unvalidatedTeams);

const CONFLUENCE_PAT = process.env.CONFLUENCE_PAT;
if (!CONFLUENCE_PAT)
    throw new Error(
        "Please set the CONFLUENCE_PAT environment variable to your Personal Access Token (PAT) for your organisations Confluence API. " +
            "For information on how to create a PAT, please see https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html."
    );

const CONFLUENCE_ROOT_DOMAIN = process.env.CONFLUENCE_ROOT_DOMAIN;
if (!CONFLUENCE_ROOT_DOMAIN)
    throw new Error(
        "Please set the CONFLUENCE_ROOT_DOMAIN environment variable to the root domain of your organisations Confluence instance."
    );

const TEAM_NAME = process.env.TEAM_NAME;
if (!TEAM_NAME)
    throw new Error(
        "Please set the TEAM environment variable to the name of your team."
    );

if (!(TEAM_NAME in teams)) throw new Error(`Unknown team: ${TEAM_NAME}. Make sure you've configured the teams.json correctly, as outlined in the README.md.`);

export const config = {
    CONFLUENCE_PAT,
    CONFLUENCE_ROOT_DOMAIN,
    teamAnnualLeaveSubCalendarId: teams[TEAM_NAME].annualLeaveSubCalendarId,
    teamDevelopers: teams[TEAM_NAME].developers,
};
