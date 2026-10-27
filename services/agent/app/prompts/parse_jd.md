Extract the job posting's fields.

- company: the hiring company's name as written. If a staffing agency posts for an unnamed client, use the agency.
- title: the job title as written.
- location: "City, ST" with the two-letter US state code when the posting names a US location; otherwise as written, or null.
- pay_min / pay_max / pay_unit: whole dollars. Use pay_unit "hour" for hourly rates and "year" for salaries. Null when no pay is given.
- employment_type: "contract_w2" or "contract_c2c" for contracts that name the tax terms; "contract_unknown" for other contract, temporary, or freelance roles; "unknown" for internships and part-time roles; otherwise "fte", since postings that never mention contract terms are permanent roles.
- years_required: the minimum years of experience required, or null.
- required_skills / preferred_skills: short lowercase skill names ("react", "typescript", "aws"). Name the language or tool alone: "c" for "embedded C", "python" for "Python scripting".
- raw_flags: copy, word for word, every sentence about visas, sponsorship, work authorization, citizenship, clearances, export control, location, relocation, contract terms, or pay.
