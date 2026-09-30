package com.hqyj.ka.migration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;

/** KA_MIGRATION_TEST_URL must name an empty, disposable MySQL 8 database. */
@EnabledIfEnvironmentVariable(named = "KA_MIGRATION_TEST_URL", matches = "jdbc:mysql:.*")
@SpringBootTest(properties = {
        "spring.datasource.url=${KA_MIGRATION_TEST_URL}",
        "spring.datasource.username=${KA_MIGRATION_TEST_USER}",
        "spring.datasource.password=${KA_MIGRATION_TEST_PASSWORD}",
        "spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver",
        "spring.flyway.enabled=true",
        "spring.flyway.locations=classpath:db/migration",
        "spring.flyway.baseline-on-migrate=false",
        "spring.flyway.clean-disabled=true",
        "spring.jpa.hibernate.ddl-auto=validate"
})
class MySqlMigrationTest {
    @Test void migrationMatchesAllEntities() { }
}
