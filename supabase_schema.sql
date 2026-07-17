-- Create Families Table
CREATE TABLE IF NOT EXISTS public.families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    whatsapp_phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Grocery Items Table
CREATE TABLE IF NOT EXISTS public.grocery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES public.families(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    quantity TEXT NOT NULL DEFAULT '1',
    added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    added_by_name TEXT NOT NULL,
    checked BOOLEAN NOT NULL DEFAULT FALSE,
    category TEXT NOT NULL DEFAULT 'Groceries',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_items ENABLE ROW LEVEL SECURITY;

-- Families RLS Policies
CREATE POLICY "Allow read access to all authenticated users" 
    ON public.families FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Allow insert access to authenticated users" 
    ON public.families FOR INSERT 
    TO authenticated 
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow update access to creators or admins" 
    ON public.families FOR UPDATE 
    TO authenticated 
    USING (created_by = auth.uid());

-- Profiles RLS Policies
CREATE POLICY "Allow read access to profiles for authenticated users" 
    ON public.profiles FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Allow profile creator to update own profile" 
    ON public.profiles FOR UPDATE 
    TO authenticated 
    USING (id = auth.uid());

CREATE POLICY "Allow profile creator to insert own profile" 
    ON public.profiles FOR INSERT 
    TO authenticated 
    WITH CHECK (id = auth.uid());

-- Grocery Items RLS Policies
CREATE POLICY "Allow select for family members" 
    ON public.grocery_items FOR SELECT 
    TO authenticated 
    USING (
        family_id = (SELECT family_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Allow insert for family members" 
    ON public.grocery_items FOR INSERT 
    TO authenticated 
    WITH CHECK (
        family_id = (SELECT family_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Allow update for family members" 
    ON public.grocery_items FOR UPDATE 
    TO authenticated 
    USING (
        family_id = (SELECT family_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Allow delete for family members" 
    ON public.grocery_items FOR DELETE 
    TO authenticated 
    USING (
        family_id = (SELECT family_id FROM public.profiles WHERE id = auth.uid())
    );

-- Trigger to Automatically Create Profile for New Auth Users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, role)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'display_name', 'Family Member'),
        'member'
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
