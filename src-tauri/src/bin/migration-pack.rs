fn main() {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 2 {
        eprintln!("Usage: migration-pack <normalized-source-directory> <new-output.zip>");
        std::process::exit(2);
    }
    match thoock_desktop_app_lib::pack_migration(
        std::path::Path::new(&args[0]),
        std::path::Path::new(&args[1]),
    ) {
        Ok(()) => println!("Migration bundle prepared with versioned manifest and file checksums."),
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(1);
        }
    }
}
