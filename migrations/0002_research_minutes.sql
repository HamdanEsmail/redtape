-- Whole minutes the TinyResearch run took, rounded, from the run's created_at and completed_at.
-- Null when either time is missing. Stored when the comparison moves to checking and on import.
ALTER TABLE comparisons ADD COLUMN research_minutes INTEGER;
