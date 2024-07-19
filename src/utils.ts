export const dateTimeFormatter = Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "long",
});

export const formatDate = (date: Date) =>
    dateTimeFormatter.format(date).split(" ").slice(0, 4).join(" ");

export const pluralize = (
    count: number,
    singular: string,
    plural: string = singular + "s"
) => (count === 1 ? singular : plural);
