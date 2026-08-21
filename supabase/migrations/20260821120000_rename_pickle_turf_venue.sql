-- Rename the "Pickle Turf" venue to "Pickleturf" (organizer's preferred spelling).
update public.venues set name = 'Pickleturf' where name = 'Pickle Turf';
