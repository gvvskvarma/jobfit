Extract the job posting's fields.

- company: the hiring company's name as written. If a staffing agency posts for an unnamed client, use the agency.
- title: the job title as written.
- location: "City, ST" with the two-letter US state code when the posting names a US location; otherwise as written, or null.
- pay_min / pay_max / pay_unit: whole dollars. Use pay_unit "hour" for hourly rates and "year" for salaries. Null when no pay is given.
- years_required: the minimum years of experience required, or null.
- required_skills / preferred_skills: short lowercase skill names ("react", "typescript", "aws").
- raw_flags: copy, word for word, every sentence about visas, sponsorship, work authorization, citizenship, clearances, export control, location, relocation, contract terms, or pay.
